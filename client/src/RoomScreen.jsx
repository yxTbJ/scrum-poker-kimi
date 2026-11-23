import { useState } from 'react';
import Avatar from './Avatar.jsx';
import DeckSettings from './DeckSettings.jsx';
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

const OfflineIcon = () => (
  <span className="offline-icon" title="Нет соединения">
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="8" cy="8" r="5.5" />
      <line x1="4.2" y1="11.8" x2="11.8" y2="4.2" />
    </svg>
  </span>
);

const voteStatus = (p, revealed) => {
  if (revealed) return p.vote ?? '—';
  return p.voted ? '✓ проголосовал' : 'думает…';
};

const modeText = (mode) => (mode && mode.length ? mode.join(' и ') : '—');

const ROLE_ORDER = ['developer', 'qa', 'other'];

// Три круговые диаграммы по ролям (общая не показывается)
function RolePies({ room }) {
  return (
    <div className="charts charts-pies">
      {ROLE_ORDER.map((role) => {
        const group = room.participants.filter((p) => p.jobRole === role);
        if (group.length === 0) return null;
        const stats = room.stats.byRole[role];
        const votesCount = group.filter((p) => p.vote !== null && p.vote !== undefined).length;
        return (
          <section key={role} className="pie-block">
            <h3>
              {JOB_ROLES[role]}: <b>{modeText(stats.mode)}</b>
              <span className="stat-count"> ({stats.votes})</span>
            </h3>
            {votesCount > 0 ? (
              <PieChart participants={group} />
            ) : (
              <p className="hint chart-empty">Нет голосов</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

function VoteCard({ p }) {
  return (
    <div className="vote-card">
      <div className="vote-value">{p.vote ?? '—'}</div>
      <div className="vote-name">
        <Avatar name={p.name} id={p.id} size={22} />
        {p.connected === false && <OfflineIcon />}
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
  );
}

function ParticipantPill({ p, isMe, revealed }) {
  return (
    <li className={isMe ? 'me' : undefined}>
      <Avatar name={p.name} id={p.id} size={28} />
      {p.connected === false && <OfflineIcon />}
      <span className="p-name">
        {p.name}
        {isMe && <span className="me-badge">вы</span>}
        {p.role === 'admin' && (
          <span className="admin-star" title="Администратор">
            {' '}
            ★
          </span>
        )}
      </span>
      <span
        className={revealed ? 'status revealed-vote' : p.voted ? 'status voted' : 'status thinking'}
      >
        {voteStatus(p, revealed)}
      </span>
    </li>
  );
}

export default function RoomScreen({ room, connected, error, onDismissError, onSend, onReconnect, onLeave }) {
  const admin = room.you.role === 'admin';
  const me = room.participants.find((p) => p.id === room.you.id);
  const votedCount = room.participants.filter((p) => p.voted).length;
  const canVote = room.sessionActive && !room.revealed;
  const [sortDir, setSortDir] = useState('asc');
  const byRole = (role) => room.participants.filter((p) => p.jobRole === role);

  // проголосовавшие сверху, отсортированные по значению; не голосовавшие — в конце
  const sortByVote = (group) => {
    if (!room.revealed) return group;
    const voted = group.filter((p) => p.vote !== null && p.vote !== undefined);
    const others = group.filter((p) => p.vote === null || p.vote === undefined);
    voted.sort((a, b) => (sortDir === 'asc' ? a.vote - b.vote : b.vote - a.vote));
    return [...voted, ...others];
  };

  return (
    <div className="room">
      <header className="room-header">
        <h1>Скрам-покер</h1>
        <div className="room-meta">
          <span className="room-code">
            Код комнаты: <b>{room.code}</b>
          </span>
          {admin && <InviteLink code={room.code} />}
          <button
            className="link-btn leave-btn"
            title={admin ? 'Комната будет закрыта для всех участников' : 'Вернуться на стартовый экран'}
            onClick={onLeave}
          >
            Покинуть комнату
          </button>
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
            <div className="result-header">
              <h2>Карты вскрыты</h2>
              <button
                className="link-btn sort-btn"
                title="Порядок отображения проголосовавших"
                onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
              >
                {sortDir === 'asc' ? '↑ по возрастанию' : '↓ по убыванию'}
              </button>
            </div>
            {room.mode != null && room.mode.length > 0 && (
              <div className="average">
                Большинство выбрало: <b>{modeText(room.mode)}</b>
              </div>
            )}
            <div className="results-by-role">
              {ROLE_ORDER.map((role) => {
                const group = byRole(role);
                if (group.length === 0) return null;
                const stats = room.stats.byRole[role];
                return (
                  <section key={role} className="role-result">
                    <h3>
                      {JOB_ROLES[role]}: <b>{modeText(stats.mode)}</b>
                      <span className="stat-count"> ({stats.votes})</span>
                    </h3>
                    <div className="votes">
                      {sortByVote(group).map((p) => (
                        <VoteCard key={p.id} p={p} />
                      ))}
                    </div>
                  </section>
                );
              })}
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

        <div className="participants-grid">
          {ROLE_ORDER.map((role) => {
            const group = byRole(role);
            if (group.length === 0) return null;
            return (
              <section key={role} className="participant-group">
                <h3>
                  {JOB_ROLES[role]} <span className="stat-count">({group.length})</span>
                </h3>
                <ul className="participants">
                  {sortByVote(group).map((p) => (
                    <ParticipantPill
                      key={p.id}
                      p={p}
                      isMe={p.id === room.you.id}
                      revealed={room.revealed}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
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

      {room.revealed && <RolePies room={room} />}
    </div>
  );
}
