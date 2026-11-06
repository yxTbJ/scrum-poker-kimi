import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createRoomStore } from './rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const MAX_BODY_BYTES = 64 * 1024;
const MAX_WS_MESSAGE_BYTES = 16 * 1024;

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Слишком большой запрос'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
      } catch {
        reject(Object.assign(new Error('Некорректный JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'Метод не поддерживается' });
    return;
  }
  if (!fs.existsSync(CLIENT_DIST)) {
    sendJson(res, 503, { error: 'Клиент не собран. Запустите `npm run build` или `npm run dev -w client`.' });
    return;
  }
  const requested = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.resolve(CLIENT_DIST, `.${decodeURIComponent(requested)}`);
  const finalPath = filePath.startsWith(CLIENT_DIST) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()
    ? filePath
    : path.join(CLIENT_DIST, 'index.html'); // SPA fallback
  const ext = path.extname(finalPath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(finalPath).pipe(res);
}

export function createApp({ store = createRoomStore() } = {}) {
  const conns = new Map(); // roomCode -> Set<WebSocket>

  function sendTo(ws, message) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
  }

  function broadcast(roomCode) {
    const room = store.getRoom(roomCode);
    const sockets = conns.get(roomCode);
    if (!room || !sockets) return;
    for (const ws of sockets) {
      const participant = room.participants.get(ws.ctx.participantId);
      if (participant) sendTo(ws, { type: 'state', room: store.publicState(room, participant) });
    }
  }

  async function handleHttp(req, res) {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/api/health' && req.method === 'GET') {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (url.pathname === '/api/rooms' && req.method === 'POST') {
        const body = await readJsonBody(req);
        try {
          const { token, state } = store.createRoom(body.name);
          sendJson(res, 201, { code: state.code, token, state });
        } catch (error) {
          sendJson(res, error.status ?? 400, { error: error.message });
        }
        return;
      }

      const joinMatch = url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9]{6})\/join$/);
      if (joinMatch && req.method === 'POST') {
        const body = await readJsonBody(req);
        try {
          const { token, state } = store.joinRoom(joinMatch[1].toUpperCase(), body.name);
          sendJson(res, 201, { token, state });
        } catch (error) {
          sendJson(res, error.status ?? 400, { error: error.message });
        }
        return;
      }

      if (url.pathname.startsWith('/api/')) {
        sendJson(res, 404, { error: 'Не найдено' });
        return;
      }

      serveStatic(req, res, url.pathname);
    } catch (error) {
      sendJson(res, error.status ?? 500, { error: error.status ? error.message : 'Внутренняя ошибка сервера' });
    }
  }

  function handleWsMessage(ws, data) {
    if (data.length > MAX_WS_MESSAGE_BYTES) {
      sendTo(ws, { type: 'error', message: 'Слишком большое сообщение' });
      return;
    }
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      sendTo(ws, { type: 'error', message: 'Некорректное сообщение' });
      return;
    }
    const { roomCode, participantId } = ws.ctx;
    const room = store.getRoom(roomCode);
    const participant = room?.participants.get(participantId);
    if (!room || !participant) {
      sendTo(ws, { type: 'error', message: 'Комната не найдена' });
      return;
    }

    let error = null;
    switch (message.type) {
      case 'start_session':
        error = store.startSession(room, participant);
        break;
      case 'end_session':
        error = store.endSession(room, participant);
        break;
      case 'vote':
        error = store.vote(room, participant, message.value);
        break;
      case 'clear_vote':
        error = store.clearVote(room, participant);
        break;
      case 'reveal':
        error = store.reveal(room, participant);
        break;
      case 'reset':
        error = store.reset(room, participant);
        break;
      case 'update_deck':
        error = store.updateDeck(room, participant, message.deck);
        break;
      default:
        error = 'Неизвестное действие';
    }

    if (error) {
      sendTo(ws, { type: 'error', message: error });
    } else {
      broadcast(roomCode);
    }
  }

  const server = http.createServer(handleHttp);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      socket.destroy();
      return;
    }
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    const ctx = store.resolveToken(url.searchParams.get('token'));
    if (!ctx) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.ctx = ctx;
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    const { roomCode } = ws.ctx;
    if (!conns.has(roomCode)) conns.set(roomCode, new Set());
    conns.get(roomCode).add(ws);
    broadcast(roomCode);

    ws.on('message', (data) => handleWsMessage(ws, data));
    ws.on('close', () => {
      const sockets = conns.get(roomCode);
      if (sockets) {
        sockets.delete(ws);
        if (sockets.size === 0) conns.delete(roomCode);
      }
    });
  });

  return { server, store, wss };
}
