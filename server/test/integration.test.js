import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createApp } from '../src/app.js';

let app;
let baseUrl;
let wsUrl;

test.before(async () => {
  app = createApp();
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const { port } = app.server.address();
  baseUrl = `http://127.0.0.1:${port}`;
  wsUrl = `ws://127.0.0.1:${port}`;
});

test.after(async () => {
  // Гарантированно рвём все соединения (включая WS), иначе server.close()
  // ждёт их вечно, а детали падения не печатаются
  for (const ws of app.wss.clients) ws.terminate();
  app.server.closeAllConnections?.();
  await new Promise((resolve) => app.server.close(resolve));
});

async function postJson(path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

function connectClient(token) {
  const ws = new WebSocket(`${wsUrl}/ws?token=${encodeURIComponent(token)}`);
  const messages = [];
  let seq = 0;
  const waiters = [];

  ws.on('message', (raw) => {
    seq += 1;
    const msg = JSON.parse(raw.toString());
    msg.seq = seq;
    messages.push(msg);
    for (let i = waiters.length - 1; i >= 0; i -= 1) {
      if (waiters[i].predicate(msg)) {
        clearTimeout(waiters[i].timer);
        waiters[i].resolve(msg);
        waiters.splice(i, 1);
      }
    }
  });

  const opened = new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  return {
    ws,
    messages,
    opened,
    send(obj) {
      ws.send(JSON.stringify(obj));
    },
    waitFor(predicate, { after = 0, timeout = 3000 } = {}) {
      const found = messages.find((m) => m.seq > after && predicate(m));
      if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const index = waiters.findIndex((w) => w.resolve === resolve);
          if (index !== -1) waiters.splice(index, 1);
          reject(new Error('Таймаут ожидания сообщения от сервера'));
        }, timeout);
        waiters.push({ predicate, resolve, timer });
      });
    },
    waitForError(pattern, after) {
      return this.waitFor((m) => m.type === 'error' && pattern.test(m.message), { after });
    },
    lastState() {
      return messages.filter((m) => m.type === 'state').at(-1)?.room ?? null;
    },
    close() {
      ws.close();
    },
  };
}

const participantByName = (state, name) =>
  state.participants.find((p) => p.name === name);

test('полный сценарий: сессия, роли, набор карт, голосование', async () => {
  // Администратор создаёт комнату
  const created = await postJson('/api/rooms', { name: 'Аня' });
  assert.equal(created.status, 201);
  assert.equal(created.data.state.you.role, 'admin');
  assert.equal(created.data.state.deck.length, 30);
  assert.equal(created.data.state.sessionActive, false);
  const roomCode = created.data.code;
  const adminToken = created.data.token;

  // REST-валидация: имя обязательно, комната должна существовать
  const emptyName = await postJson('/api/rooms', { name: '   ' });
  assert.equal(emptyName.status, 400);
  const unknownRoom = await postJson('/api/rooms/ZZZZZZ/join', { name: 'Вова' });
  assert.equal(unknownRoom.status, 404);

  // Участник входит по коду
  const joined = await postJson(`/api/rooms/${roomCode}/join`, { name: 'Боря' });
  assert.equal(joined.status, 201);
  const userId = joined.data.state.you.id;
  const userToken = joined.data.token;

  // Оба подключаются по WebSocket
  const admin = connectClient(adminToken);
  const user = connectClient(userToken);
  await Promise.all([admin.opened, user.opened]);

  await admin.waitFor((m) => m.type === 'state' && m.room.participants.length === 2);
  let state = admin.lastState();
  assert.equal(participantByName(state, 'Аня').role, 'admin');
  assert.equal(participantByName(state, 'Боря').role, 'participant');

  // Администратор настраивает набор: оставляет 1, 2, 3, 10 и добавляет 45
  let mark = user.messages.length;
  admin.send({ type: 'update_deck', deck: [1, 2, 3, 10, 45] });
  const deckState = await user.waitFor((m) => m.type === 'state' && m.room.deck.length === 5, { after: mark });
  assert.deepEqual(deckState.room.deck, [1, 2, 3, 10, 45]);

  // Участник не может менять набор
  mark = user.messages.length;
  user.send({ type: 'update_deck', deck: [1, 2] });
  await user.waitForError(/администратор/i, mark);

  // До начала сессии голосовать нельзя
  mark = user.messages.length;
  user.send({ type: 'vote', value: 10 });
  await user.waitForError(/сессия не начата/i, mark);

  // Участник не может начать сессию
  mark = user.messages.length;
  user.send({ type: 'start_session' });
  await user.waitForError(/администратор/i, mark);

  // Администратор начинает сессию
  admin.send({ type: 'start_session' });
  const started = await user.waitFor((m) => m.type === 'state' && m.room.sessionActive === true);
  assert.equal(started.room.sessionActive, true);

  // Во время сессии набор изменять нельзя
  mark = admin.messages.length;
  admin.send({ type: 'update_deck', deck: [1, 2] });
  await admin.waitForError(/сессии/i, mark);

  // Голос вне набора отклоняется
  mark = user.messages.length;
  user.send({ type: 'vote', value: 7 });
  await user.waitForError(/нет в наборе/i, mark);
  assert.equal(user.lastState().participants.find((p) => p.id === userId).vote, null);

  // Нецелый голос отклоняется
  mark = user.messages.length;
  user.send({ type: 'vote', value: 2.5 });
  await user.waitForError(/целым числом/i, mark);

  // Оба голосуют допустимыми картами
  user.send({ type: 'vote', value: 10 });
  await admin.waitFor((m) => m.type === 'state' && participantByName(m.room, 'Боря').voted);
  admin.send({ type: 'vote', value: 45 });
  await user.waitFor((m) => m.type === 'state' && m.room.participants.every((p) => p.voted));

  // Участник очищает свой голос — статус возвращается к «думает»
  mark = user.messages.length;
  user.send({ type: 'clear_vote' });
  const cleared = await user.waitFor(
    (m) => m.type === 'state' && !m.room.participants.find((p) => p.id === userId).voted,
    { after: mark },
  );
  assert.equal(participantByName(cleared.room, 'Боря').vote, null);

  // Голосует заново
  mark = user.messages.length;
  user.send({ type: 'vote', value: 10 });
  const reVoted = await user.waitFor(
    (m) => m.type === 'state' && m.room.participants.every((p) => p.voted),
    { after: mark },
  );

  // Свой голос виден до вскрытия, чужой скрыт (проверяем по самому свежему состоянию)
  state = reVoted.room;
  assert.equal(participantByName(state, 'Боря').vote, 10);
  assert.equal(participantByName(state, 'Аня').vote, null);

  // Участник не может вскрыть карты
  mark = user.messages.length;
  user.send({ type: 'reveal' });
  await user.waitForError(/администратор/i, mark);
  assert.equal(user.lastState().revealed, false);

  // Администратор вскрывает карты, среднее рассчитано верно
  admin.send({ type: 'reveal' });
  const revealed = await user.waitFor((m) => m.type === 'state' && m.room.revealed);
  assert.equal(revealed.room.average, 27.5);
  assert.equal(participantByName(revealed.room, 'Боря').vote, 10);
  assert.equal(participantByName(revealed.room, 'Аня').vote, 45);

  // После вскрытия голосовать нельзя
  mark = user.messages.length;
  user.send({ type: 'vote', value: 10 });
  await user.waitForError(/вскрыты/i, mark);

  // Участник не может начать новый раунд
  mark = user.messages.length;
  user.send({ type: 'reset' });
  await user.waitForError(/администратор/i, mark);

  // Администратор начинает новый раунд — голоса сброшены, сессия продолжается
  mark = user.messages.length;
  admin.send({ type: 'reset' });
  const resetState = await user.waitFor(
    (m) => m.type === 'state' && !m.room.revealed && m.room.participants.every((p) => !p.voted),
    { after: mark },
  );
  assert.equal(resetState.room.sessionActive, true);
  assert.equal(resetState.room.average, null);
  assert.deepEqual(resetState.room.deck, [1, 2, 3, 10, 45]);

  // После сброса можно голосовать снова
  mark = admin.messages.length;
  user.send({ type: 'vote', value: 3 });
  await admin.waitFor((m) => m.type === 'state' && participantByName(m.room, 'Боря').voted, { after: mark });

  // Участник не может закончить сессию
  mark = user.messages.length;
  user.send({ type: 'end_session' });
  await user.waitForError(/администратор/i, mark);

  // Администратор заканчивает сессию: голоса очищены, карты недоступны
  mark = user.messages.length;
  admin.send({ type: 'end_session' });
  const ended = await user.waitFor(
    (m) => m.type === 'state' && m.room.sessionActive === false && m.room.participants.every((p) => !p.voted),
    { after: mark },
  );
  assert.equal(ended.room.revealed, false);

  // После конца сессии голосовать нельзя
  mark = user.messages.length;
  user.send({ type: 'vote', value: 10 });
  await user.waitForError(/сессия не начата/i, mark);

  // Вскрытие без активной сессии нельзя
  mark = admin.messages.length;
  admin.send({ type: 'reveal' });
  await admin.waitForError(/сессия/i, mark);

  // После конца сессии набор снова можно менять
  mark = user.messages.length;
  admin.send({ type: 'update_deck', deck: [1, 2, 3] });
  const deck2 = await user.waitFor((m) => m.type === 'state' && m.room.deck.length === 3, { after: mark });
  assert.deepEqual(deck2.room.deck, [1, 2, 3]);

  admin.close();
  user.close();
});

test('невалидный токен WS отклоняется', async () => {
  const ws = new WebSocket(`${wsUrl}/ws?token=unknown`);
  const result = await new Promise((resolve) => {
    ws.on('error', (err) => resolve({ kind: 'error', message: err.message }));
    ws.on('open', () => resolve({ kind: 'open' }));
  });
  assert.equal(result.kind, 'error');
  ws.close();
});
