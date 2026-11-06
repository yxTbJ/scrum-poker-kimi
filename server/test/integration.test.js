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

test('полный сценарий: администратор и участник', async () => {
  // Администратор создаёт комнату
  const created = await postJson('/api/rooms', { name: 'Аня' });
  assert.equal(created.status, 201);
  assert.equal(created.data.state.you.role, 'admin');
  assert.equal(created.data.state.deck.length, 30);
  assert.equal(created.data.state.deck[0], 1);
  assert.equal(created.data.state.deck[29], 30);
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
  assert.equal(joined.data.state.you.role, 'participant');
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
  await user.waitFor((m) => m.type === 'error' && /администратор/i.test(m.message), { after: mark });

  // Голос вне набора отклоняется
  mark = user.messages.length;
  user.send({ type: 'vote', value: 7 });
  await user.waitFor((m) => m.type === 'error' && /нет в наборе/i.test(m.message), { after: mark });
  assert.equal(user.lastState().participants.find((p) => p.id === joined.data.state.you.id).vote, null);

  // Нецелый голос отклоняется
  mark = user.messages.length;
  user.send({ type: 'vote', value: 2.5 });
  await user.waitFor((m) => m.type === 'error' && /целым числом/i.test(m.message), { after: mark });

  // Оба голосуют допустимыми картами
  user.send({ type: 'vote', value: 10 });
  await admin.waitFor(
    (m) => m.type === 'state' && participantByName(m.room, 'Боря').voted,
  );
  admin.send({ type: 'vote', value: 45 });
  await user.waitFor(
    (m) => m.type === 'state' && m.room.participants.every((p) => p.voted),
  );

  // Свой голос виден до вскрытия, чужой скрыт
  state = user.lastState();
  assert.equal(participantByName(state, 'Боря').vote, 10);
  assert.equal(participantByName(state, 'Аня').vote, null);

  // Участник не может вскрыть карты
  mark = user.messages.length;
  user.send({ type: 'reveal' });
  await user.waitFor((m) => m.type === 'error' && /администратор/i.test(m.message), { after: mark });
  assert.equal(user.lastState().revealed, false);

  // Администратор вскрывает карты, среднее рассчитано верно
  admin.send({ type: 'reveal' });
  const revealed = await user.waitFor((m) => m.type === 'state' && m.room.revealed);
  assert.equal(revealed.room.average, 27.5);
  assert.equal(participantByName(revealed.room, 'Боря').vote, 10);
  assert.equal(participantByName(revealed.room, 'Аня').vote, 45);

  // Участник не может начать новый раунд
  mark = user.messages.length;
  user.send({ type: 'reset' });
  await user.waitFor((m) => m.type === 'error' && /администратор/i.test(m.message), { after: mark });

  // Администратор начинает новый раунд — голоса сброшены
  mark = user.messages.length;
  admin.send({ type: 'reset' });
  const resetState = await user.waitFor(
    (m) => m.type === 'state' && !m.room.revealed && m.room.participants.every((p) => !p.voted),
    { after: mark },
  );
  assert.equal(resetState.room.average, null);
  assert.deepEqual(resetState.room.deck, [1, 2, 3, 10, 45]);

  // Нельзя проголосовать после вскрытия — уже сброшено, проверим повторно:
  // вскрываем пустую комнату и пытаемся голосовать
  admin.send({ type: 'reveal' });
  await user.waitFor((m) => m.type === 'state' && m.room.revealed);
  mark = user.messages.length;
  user.send({ type: 'vote', value: 10 });
  await user.waitFor((m) => m.type === 'error' && /вскрыты/i.test(m.message), { after: mark });

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
