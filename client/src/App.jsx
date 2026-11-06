import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoom, joinRoom } from './api.js';
import RoomScreen from './RoomScreen.jsx';

function wsUrlFor(token) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`;
}

export default function App() {
  const [view, setView] = useState('entry');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [room, setRoom] = useState(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const sessionRef = useRef(null);

  const connectWs = useCallback((token) => {
    if (wsRef.current) wsRef.current.close();
    const ws = new WebSocket(wsUrlFor(token));
    ws.onopen = () => {
      setConnected(true);
      setError('');
    };
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'state') setRoom(msg.room);
      else if (msg.type === 'error') setError(msg.message);
    };
    ws.onclose = () => setConnected(false);
    wsRef.current = ws;
  }, []);

  const enterRoom = useCallback(
    (roomCode, token, initialState) => {
      sessionRef.current = { code: roomCode, token };
      sessionStorage.setItem(`scrum-poker:${roomCode}`, token);
      history.replaceState(null, '', `/?room=${roomCode}`);
      setRoom(initialState);
      setView('room');
      setError('');
      connectWs(token);
    },
    [connectWs],
  );

  // Восстановление сессии по ссылке-приглашению ?room=КОД
  useEffect(() => {
    const param = new URLSearchParams(location.search).get('room');
    if (!param) return undefined;
    const roomCode = param.trim().toUpperCase();
    setCode(roomCode);
    const token = sessionStorage.getItem(`scrum-poker:${roomCode}`);
    if (!token) return undefined;

    let entered = false;
    const probe = new WebSocket(wsUrlFor(token));
    probe.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'state' && !entered) {
        entered = true;
        enterRoom(roomCode, token, msg.room);
        probe.close();
      }
    };
    probe.onclose = () => {
      if (!entered) sessionStorage.removeItem(`scrum-poker:${roomCode}`);
    };
    return () => probe.close();
  }, [enterRoom]);

  const submit = async (action) => {
    setError('');
    if (!name.trim()) {
      setError('Введите имя');
      return;
    }
    setBusy(true);
    try {
      if (action === 'create') {
        const res = await createRoom(name);
        enterRoom(res.code, res.token, res.state);
      } else {
        const roomCode = code.trim().toUpperCase();
        if (!roomCode) {
          setError('Введите код комнаты');
          return;
        }
        const res = await joinRoom(roomCode, name);
        enterRoom(roomCode, res.token, res.state);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const send = (obj) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(obj));
    } else {
      setError('Нет соединения с сервером');
    }
  };

  if (view === 'room' && room) {
    return (
      <RoomScreen
        room={room}
        connected={connected}
        error={error}
        onDismissError={() => setError('')}
        onSend={send}
        onReconnect={() => {
          if (sessionRef.current) connectWs(sessionRef.current.token);
        }}
      />
    );
  }

  return (
    <div className="entry">
      <form
        className="entry-card"
        onSubmit={(e) => {
          e.preventDefault();
          submit('create');
        }}
      >
        <h1>Скрам-покер</h1>
        <p className="subtitle">Planning poker для оценки задач</p>

        <label className="field">
          <span>Ваше имя</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            placeholder="Обязательно для заполнения"
            autoFocus
          />
        </label>

        <button className="primary wide" type="submit" disabled={busy}>
          Создать комнату
        </button>

        <div className="divider">или войти по коду</div>

        <div className="join-row">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Код комнаты"
            maxLength={6}
          />
          <button type="button" disabled={busy} onClick={() => submit('join')}>
            Войти
          </button>
        </div>

        {error && <p className="error-text">{error}</p>}
      </form>
    </div>
  );
}
