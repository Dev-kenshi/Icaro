const url = (p: string) => `${import.meta.env.BASE_URL}api/auth/${p}`;

export type AuthUser = { username: string; role: 'user' | 'admin' };

export async function fetchMe(): Promise<AuthUser | null> {
  const r = await fetch(url('me'), { credentials: 'same-origin' });
  if (r.status === 401) return null;
  if (!r.ok) throw new Error('Falha ao verificar a sessão.');
  return r.json();
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const r = await fetch(url('login'), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Falha no acesso.');
  return data;
}

export async function logout(): Promise<void> {
  await fetch(url('logout'), { method: 'POST', credentials: 'same-origin' });
}
