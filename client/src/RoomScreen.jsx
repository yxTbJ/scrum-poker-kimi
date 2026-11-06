import { useState } from 'react';
import Avatar from './Avatar.jsx';
import DeckSettings from './DeckSettings.jsx';
import VoteChart from './VoteChart.jsx';
import PieChart from './PieChart.jsx';
import { JOB_ROLES, JOB_ROLE_SHORT } from './roles.js';

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

const CHART_GROUPS = [
  { key: 'all', label: 'Все' },
  { key: 'developer', label: JOB_ROLES.developer },
  { key: 'qa', label: JOB_ROLES.qa },
  { key: 'other', label: JOB_ROLES.other },
];

// Диаграммы с переключением группы: общие или отдельно по ролям
function ChartsPanel({ room }) {
  const [group, setGroup] = useState('all');
  const participants =
    group === 'all' ? room.participants : room.participants.filter((p) => p.jobRole === group);
  const votesCount = participants.filter((p) => p.vote !== null && p.vote !== undefined).length;
  const stats = group === 'all' ? room.stats.total : room.stats.byRole[group];

  return (
    <div className="charts">
      <div className="chart-tabs">
        {CHART_GROUPS.map((g) => (
          <button
            key={g.key}
            className={group === g.key ? 'tab active' : 'tab'}
            onClick={() => setGroup(g.key)}
          >
            {g.label}
          </button>
        ))}
      </div>
      <div className="chart-group-avg">
        Среднее по группе: <b>{stats?.average ?? '—'}</b> · голосов: {stats?.votes ?? 0}
      </div>
      {votesCount > 0 ? (
        <div className="charts-row">
          <VoteChart participants={participants} />
          <PieChart participants={participants} />
        </div>
      ) : (
        <p className="hint chart-empty">В этой группе нет голосов</p>
      )}
    </div>
  );
}

export default function RoomScreen({ room, connected, error, onDismissError, onSend, onReconnect }) {
  const admin = room.you.role === 'admin';
  const me = room.participants.find((p) => p.id === room.you.id);
  const votedCount = room.participants.filter((p) => p.voted).length;
  const canVote = room.sessionActive && !room.revealed;

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
            <div className="stats-chips">
              {Object.entries(room.stats.byRole).map(([role, s]) => (
                <span key={role} className="stat-chip">
                  {JOB_ROLES[role]}: <b>{s.average ?? '—'}</b>
                  <span className="stat-count">({s.votes})</span>
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="waiting">
            {!room.sessionActive ? (
              <>
                <p>Сессия не начата — ожидайте администратора</p>
                <p className="hint">Карты появятся, когда администратор начнёт сессию.</p>
              </>
            ) : (
              <>
                <p>
                  Голосование идёт — проголосовали {votedCount} из {room.participants.length}
                </p>
                <p className="hint">Выберите карту ниже. Карты будут вскрыты администратором.</p>
              </>
            )}
          </div>
        )}

        <ul className="participants">
          {room.participants.map((p) => {
            const isMe = p.id === room.you.id;
            return (
              <li key={p.id} className={isMe ? 'me' : undefined}>
                <Avatar name={p.name} id={p.id} size={28} />
                <span className="p-name">
                  {p.name}
                  {isMe && <span className="me-badge">вы</span>}
                  <span className={`role-badge role-${p.jobRole}`} title={JOB_ROLES[p.jobRole]}>
                    {JOB_ROLE_SHORT[p.jobRole]}
                  </span>
                  {p.role === 'admin' && (
                    <span className="admin-star" title="Администратор">
                      {' '}
                      ★
                    </span>
                  )}
                </span>
                <span
                  className={
                    room.revealed
                      ? 'status revealed-vote'
                      : p.voted
                        ? 'status voted'
                        : 'status thinking'
                  }
                >
                  {voteStatus(p, room.revealed)}
                </span>
              </li>
            );
          })}
        </ul>
      </main>

      {canVote && (
        <div className="deck">
          {room.deck.map((value) => (
            <button
              key={value}
              className={me?.vote === value ? 'card selected' : 'card'}
              title={me?.vote === value ? 'Нажмите ещё раз, чтобы отменить выбор' : undefined}
              onClick={() =>
                onSend(me?.vote === value ? { type: 'clear_vote' } : { type: 'vote', value })
              }
            >
              {value}
            </button>
          ))}
        </div>
      )}

      {admin && (
        <div className="admin-panel">
          <div className="admin-actions">
            {!room.sessionActive ? (
              <button className="primary" onClick={() => onSend({ type: 'start_session' })}>
                Начать сессию
              </button>
            ) : (
              <>
                {!room.revealed ? (
                  <button className="primary" onClick={() => onSend({ type: 'reveal' })}>
                    Вскрыть карты
                  </button>
                ) : (
                  <button className="primary" onClick={() => onSend({ type: 'reset' })}>
                    Новый раунд
                  </button>
                )}
                <button className="danger" onClick={() => onSend({ type: 'end_session' })}>
                  Закончить сессию
                </button>
              </>
            )}
          </div>
          {room.sessionActive ? (
            <p className="hint">
              Набор карт заблокирован на время сессии. Завершите сессию, чтобы изменить его.
            </p>
          ) : (
            <DeckSettings deck={room.deck} onChange={(deck) => onSend({ type: 'update_deck', deck })} />
          )}
        </div>
      )}

      {room.revealed && <ChartsPanel room={room} />}
    </div>
  );
}
