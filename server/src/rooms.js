import crypto from 'node:crypto';

export const DECK_MIN = 1;
export const DECK_MAX = 100;
export const DECK_DEFAULT_SIZE = 30;

export const JOB_ROLES = ['developer', 'qa', 'other'];

export function defaultDeck() {
  return Array.from({ length: DECK_DEFAULT_SIZE }, (_, i) => i + DECK_MIN);
}

export function validateDeck(deck) {
  if (!Array.isArray(deck)) return 'Набор карт должен быть массивом';
  if (deck.length === 0) return 'Набор карт не может быть пустым';
  if (deck.length > DECK_MAX) return `В наборе карт не может быть больше ${DECK_MAX} значений`;
  const seen = new Set();
  for (const value of deck) {
    if (!Number.isInteger(value)) return 'Значения карт должны быть целыми числами';
    if (value < DECK_MIN || value > DECK_MAX) {
      return `Значения карт должны быть от ${DECK_MIN} до ${DECK_MAX}`;
    }
    if (seen.has(value)) return 'Значения карт не должны повторяться';
    seen.add(value);
  }
  return null;
}

export function isValidJobRole(role) {
  return JOB_ROLES.includes(role);
}

export function sanitizeName(name) {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  return trimmed.slice(0, 50);
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

function averageOf(votes) {
  if (votes.length === 0) return null;
  return Math.round((votes.reduce((sum, v) => sum + v, 0) / votes.length) * 10) / 10;
}

export function createRoomStore() {
  const rooms = new Map();
  const tokens = new Map();

  function generateCode() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i += 1) {
        code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
      }
      if (!rooms.has(code)) return code;
    }
    throw new Error('Не удалось сгенерировать код комнаты');
  }

  function issueToken(roomCode, participantId) {
    const token = crypto.randomBytes(24).toString('hex');
    tokens.set(token, { roomCode, participantId });
    return token;
  }

  function clearVotes(room) {
    for (const p of room.participants.values()) p.vote = null;
  }

  function publicState(room, viewer) {
    const participants = [...room.participants.values()].map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      jobRole: p.jobRole,
      voted: p.vote !== null,
      vote: room.revealed || p.id === viewer.id ? p.vote : null,
    }));
    const allVotes = [...room.participants.values()]
      .filter((p) => p.vote !== null)
      .map((p) => p.vote);
    const byRole = {};
    for (const jobRole of JOB_ROLES) {
      const votes = [...room.participants.values()]
        .filter((p) => p.jobRole === jobRole && p.vote !== null)
        .map((p) => p.vote);
      byRole[jobRole] = {
        votes: votes.length,
        average: room.revealed ? averageOf(votes) : null,
      };
    }
    const average = room.revealed ? averageOf(allVotes) : null;
    return {
      code: room.code,
      deck: [...room.deck],
      revealed: room.revealed,
      sessionActive: room.sessionActive,
      average,
      stats: { total: { votes: allVotes.length, average }, byRole },
      participants,
      you: { id: viewer.id, role: viewer.role },
    };
  }

  const store = {
    getRoom: (code) => rooms.get(code) ?? null,

    resolveToken(token) {
      if (typeof token !== 'string' || !token) return null;
      const ctx = tokens.get(token);
      if (!ctx) return null;
      const room = rooms.get(ctx.roomCode);
      if (!room || !room.participants.has(ctx.participantId)) return null;
      return ctx;
    },

    createRoom(adminName, adminJobRole) {
      const name = sanitizeName(adminName);
      if (!name) throw httpError(400, 'Имя обязательно');
      if (!isValidJobRole(adminJobRole)) {
        throw httpError(400, 'Выберите роль: разработчик, QA или остальные сотрудники');
      }
      const code = generateCode();
      const admin = {
        id: crypto.randomUUID(),
        name,
        role: 'admin',
        jobRole: adminJobRole,
        vote: null,
      };
      const room = {
        code,
        deck: defaultDeck(),
        revealed: false,
        sessionActive: false,
        participants: new Map([[admin.id, admin]]),
      };
      rooms.set(code, room);
      const token = issueToken(code, admin.id);
      return { token, state: publicState(room, admin) };
    },

    joinRoom(code, participantName, participantJobRole) {
      const room = rooms.get(code);
      if (!room) throw httpError(404, 'Комната не найдена');
      const name = sanitizeName(participantName);
      if (!name) throw httpError(400, 'Имя обязательно');
      if (!isValidJobRole(participantJobRole)) {
        throw httpError(400, 'Выберите роль: разработчик, QA или остальные сотрудники');
      }
      const participant = {
        id: crypto.randomUUID(),
        name,
        role: 'participant',
        jobRole: participantJobRole,
        vote: null,
      };
      room.participants.set(participant.id, participant);
      const token = issueToken(code, participant.id);
      return { token, state: publicState(room, participant) };
    },

    publicState,

    removeParticipant(room, participant) {
      room.participants.delete(participant.id);
      for (const [token, ctx] of tokens) {
        if (ctx.participantId === participant.id) tokens.delete(token);
      }
    },

    deleteRoom(roomCode) {
      rooms.delete(roomCode);
      for (const [token, ctx] of tokens) {
        if (ctx.roomCode === roomCode) tokens.delete(token);
      }
    },

    startSession(room, participant) {
      if (participant.role !== 'admin') return 'Только администратор может управлять сессией';
      room.sessionActive = true;
      return null;
    },

    endSession(room, participant) {
      if (participant.role !== 'admin') return 'Только администратор может управлять сессией';
      room.sessionActive = false;
      room.revealed = false;
      clearVotes(room);
      return null;
    },

    vote(room, participant, value) {
      if (!room.sessionActive) return 'Сессия не начата — дождитесь администратора';
      if (room.revealed) return 'Карты уже вскрыты, дождитесь нового раунда';
      if (!Number.isInteger(value)) return 'Значение карты должно быть целым числом';
      if (!room.deck.includes(value)) return 'Такой карты нет в наборе комнаты';
      participant.vote = value;
      return null;
    },

    clearVote(room, participant) {
      if (!room.sessionActive) return 'Сессия не начата — дождитесь администратора';
      if (room.revealed) return 'Карты уже вскрыты, дождитесь нового раунда';
      participant.vote = null;
      return null;
    },

    reveal(room, participant) {
      if (participant.role !== 'admin') return 'Только администратор может вскрывать карты';
      if (!room.sessionActive) return 'Сессия не начата';
      room.revealed = true;
      return null;
    },

    reset(room, participant) {
      if (participant.role !== 'admin') return 'Только администратор может начинать новый раунд';
      if (!room.sessionActive) return 'Сессия не начата';
      room.revealed = false;
      clearVotes(room);
      return null;
    },

    updateDeck(room, participant, deck) {
      if (participant.role !== 'admin') return 'Только администратор может менять набор карт';
      if (room.sessionActive) return 'Нельзя менять набор карт во время активной сессии';
      const error = validateDeck(deck);
      if (error) return error;
      room.deck = [...deck].sort((a, b) => a - b);
      room.revealed = false;
      clearVotes(room);
      return null;
    },
  };

  return store;
}
