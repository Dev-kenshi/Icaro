import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { fetchMe, login, logout, type AuthUser } from '@/lib/auth';
import { RainCanvas } from './rain-canvas';
import './login.css';

const AuthUserContext = createContext<AuthUser | null>(null);
export const useAuthUser = () => useContext(AuthUserContext);

export function LoginGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [fatal, setFatal] = useState('');

  useEffect(() => {
    fetchMe().then(setUser).catch((e: Error) => setFatal(e.message)).finally(() => setChecking(false));
  }, []);

  if (checking) return <div className="lg" aria-busy="true"><RainCanvas /><p className="lg-boot" role="status">Verificando sua sessão…</p></div>;
  if (user) {
    return (
      <AuthUserContext.Provider value={user}>
        {children}
        <button
          className="lg-out"
          type="button"
          aria-label={`Sair da conta ${user.username}`}
          data-testid="button-logout"
          onClick={() => logout().finally(() => setUser(null))}
        >
          Sair · {user.username}
        </button>
      </AuthUserContext.Provider>
    );
  }
  return <LoginScreen onAuth={setUser} initialError={fatal} />;
}

function LoginScreen({ onAuth, initialError }: { onAuth: (u: AuthUser) => void; initialError: string }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      onAuth(await login(username.trim(), password));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no acesso.');
      setBusy(false);
    }
  }

  return (
    <main className="lg">
      <RainCanvas />
      <div className="lg-vignette" />
      <div className="lg-hazard lg-hazard-top" />
      <div className="lg-hazard lg-hazard-bot" />
      <section className="lg-card">
        <svg className="lg-emblem" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="52" className="lg-ring lg-ring-a" />
          <circle cx="60" cy="60" r="40" className="lg-ring lg-ring-b" />
          <path d="M60 18 L74 52 L106 60 L74 68 L60 102 L46 68 L14 60 L46 52 Z" className="lg-wing" />
          <circle cx="60" cy="60" r="6" className="lg-core" />
        </svg>
        <h1 className="lg-title">ÍCARO</h1>
        <p className="lg-sub">Assistente de operações · Contabilidade UEFS</p>
        <form onSubmit={submit} className="lg-form" autoComplete="off">
          <label>
            <span>Nome de usuário</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoComplete="username" spellCheck={false} aria-label="Nome de usuário" data-testid="input-username" required />
          </label>
          <label>
            <span>Senha</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" aria-label="Senha" data-testid="input-password" required />
          </label>
          <p className="lg-err" role="alert" data-testid="text-login-error">{error}</p>
          <button type="submit" disabled={busy} aria-busy={busy} data-testid="button-login">{busy ? 'Verificando…' : 'Entrar'}</button>
        </form>
      </section>
    </main>
  );
}
