import { useState } from 'react';
import Avatar from './Avatar.jsx';
import DeckSettings from './DeckSettings.jsx';
import VoteChart from './VoteChart.jsx';

const InviteLink = ({ code }) => {
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}/?room=${code}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Скопируйте ссылку-приглашение:', link);
    }
  };
  return (
    <button className="link-btn" onClick={copy}>
      {copied ? 'Ссылка скопирована!' : 'Пригласить участников'}
    </button>
  );
};

const voteStatus = (p, revealed) => {
  if (revealed) return p.vote ?? '—';
  return p.voted ? '✓ проголосовал' : 'думает…';
};

export default function RoomScreen({ room, connected, error, onDismissError, onSend, onReconnect }) {
  const admin = room.you.role === 'admin';
  const me = room.participants.find((p) => p.id === room.you.id);
  const votedCount = room.participants.filter((p) => p.voted).length;

  return (
    <div className="room">
      <header className="room-header">
        <h1>Скрам-покер</h1>
        <div className="room-meta">
          <span className="room-code">
            Код комнаты: <b>{room.code}</b>
          </span>
          {admin && <InviteLink code={room.code} />}
          {!connected && (
            <span className="badge-warn">
              Нет соединения
              <button onClick={onReconnect}>Переподключиться</button>
            </span>
          )}
        </div>
      </header>

      {error && (
        <div className="error-banner" role="alert" onClick={onDismissError}>
          {error} <span className="dismiss">(скрыть)</span>
        </div>
      )}

      <main className="table">
        {room.revealed ? (
          <div className="result">
            <h2>Карты вскрыты</h2>
            <div className="votes">
              {room.participants.map((p) => (
                <div key={p.id} className="vote-card">
                  <div className="vote-value">{p.vote ?? '—'}</div>
                  <div className="vote-name">
                    <Avatar name={p.name} id={p.id} size={22} />
                    <span>
                      {p.name}
                      {p.role === 'admin' && (
                        <span className="admin-star" title="Администратор">
                          {' '}
                          ★
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {room.average != null && (
              <div className="average">
                Среднее значение: <b>{room.average}</b>
              </div>
            )}
            <VoteChart participants={room.participants} />
          </div>
        ) : (
          <div className="waiting">
            <p>
              Голосование идёт — проголосовали {votedCount} из {room.participants.length}
            </p>
            <p className="hint">Выберите карту ниже. Карты будут вскрыты администратором.</p>
          </div>
        )}

        <ul className="participants">
          {room.participants.map((p) => (
            <li key={p.id}>
              <Avatar name={p.name} id={p.id} size={28} />
              <span className="p-name">
                {p.name}
                {p.role === 'admin' && (
                  <span className="admin-star" title="Администратор">
                    {' '}
                    ★
                  </span>
                )}
              </span>
              <span className={p.voted ? 'status voted' : 'status thinking'}>
                {voteStatus(p, room.revealed)}
              </span>
            </li>
          ))}
        </ul>
      </main>

      {!room.revealed && (
        <div className="deck">
          {room.deck.map((value) => (
            <button
              key={value}
              className={me?.vote === value ? 'card selected' : 'card'}
              onClick={() => onSend({ type: 'vote', value })}
            >
              {value}
            </button>
          ))}
        </div>
      )}

      {admin && (
        <div className="admin-panel">
          <div className="admin-actions">
            {!room.revealed ? (
              <button className="primary" onClick={() => onSend({ type: 'reveal' })}>
                Вскрыть карты
              </button>
            ) : (
              <button className="primary" onClick={() => onSend({ type: 'reset' })}>
                Новый раунд
              </button>
            )}
          </div>
          <DeckSettings deck={room.deck} onChange={(deck) => onSend({ type: 'update_deck', deck })} />
        </div>
      )}
    </div>
  );
}
