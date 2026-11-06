async function postJson(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Ошибка запроса: ${res.status}`);
  return data;
}

export const createRoom = (name) => postJson('/api/rooms', { name });

export const joinRoom = (code, name) =>
  postJson(`/api/rooms/${encodeURIComponent(code)}/join`, { name });
