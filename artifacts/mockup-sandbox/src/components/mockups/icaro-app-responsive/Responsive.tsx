import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Activity, BarChart3, BrainCircuit, Database, FileUp, Gauge, HeartPulse,
  Home, Menu, X, LogIn, CircleHelp,
} from 'lucide-react';
import { PreviewRouter, Link, useLocation } from '../icaro-app-current/_shared/router';
import { DatasetProvider, useDataset } from '../icaro-app-current/_shared/lib/dataset-context';
import { LoginGate, useAuthUser } from '../icaro-app-current/_shared/login-gate';
import Stage from '../icaro-app-current/_shared/stage';
import Overview from '../icaro-app-current/_shared/overview';
import Analysis from '../icaro-app-current/_shared/analysis';
import Assistant from '../icaro-app-current/_shared/assistant';
import AdminCerebro from '../icaro-app-current/_shared/admin-cerebro';
import NotFound from '../icaro-app-current/_shared/not-found';
import './_group.css';

const primaryNavigation = [
  { href: '/', label: 'Etapa', shortLabel: 'Ícaro', icon: Home },
  { href: '/overview', label: 'Visão geral', shortLabel: 'Visão geral', icon: Gauge },
  { href: '/analysis', label: 'Explorar dados', shortLabel: 'Análise', icon: BarChart3 },
  { href: '/assistant', label: 'Copiloto', shortLabel: 'Copiloto', icon: BrainCircuit },
];

function PreviewRoutes() {
  const [location] = useLocation();
  if (location === '/') return <><Stage /><StagePreviewNavigation /></>;
  const page = location === '/overview'
    ? <Overview />
    : location === '/analysis'
      ? <Analysis />
      : location === '/assistant'
        ? <Assistant />
        : location === '/admin/cerebro'
          ? <AdminCerebro />
          : <NotFound />;
  return <ResponsiveShell>{page}</ResponsiveShell>;
}

function ResponsiveShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const user = useAuthUser();
  const { dataset, importCsv, isImporting, importError } = useDataset();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerTrigger = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const navigation = [
    ...primaryNavigation,
    ...(user?.role === 'admin'
      ? [{ href: '/admin/cerebro', label: 'Administração', shortLabel: 'Admin', icon: Activity }]
      : []),
  ];

  useEffect(() => {
    if (!drawerOpen) return;
    document.querySelector<HTMLElement>('.icaro-app-responsive #responsive-navigation a')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false);
        drawerTrigger.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  const selectFile = (file?: File) => {
    if (file) void importCsv(file);
  };
  const navClass = (href: string) => `icaro-nav-link${location === href ? ' is-current' : ''}`;

  return (
    <div className="icaro-shell">
      <aside className={`icaro-sidebar${drawerOpen ? ' is-open' : ''}`} aria-label="Menu do Ícaro">
        <div className="icaro-brand-row">
          <Link href="/" className="icaro-brand" data-testid="link-brand" onClick={() => setDrawerOpen(false)}>
            <span className="icaro-brand-mark" aria-hidden="true">í</span>
            <span className="icaro-brand-name">Ícaro</span>
          </Link>
          <button
            type="button"
            className="icaro-icon-button icaro-close-drawer"
            onClick={() => { setDrawerOpen(false); drawerTrigger.current?.focus(); }}
            aria-label="Fechar menu"
            data-testid="button-close-menu"
          ><X size={19} /></button>
        </div>

        <section className="icaro-dataset-card" aria-label="Arquivo ativo">
          <div className="icaro-sidebar-eyebrow"><Database size={14} /> <span>CSV ativo</span></div>
          <div className="icaro-dataset-name" data-testid="text-active-dataset">{dataset?.name ?? 'Nenhum arquivo importado'}</div>
          <p>{dataset ? dataset.summary : 'Importe um CSV para começar'}</p>
        </section>

        <nav id="responsive-navigation" className="icaro-navigation" aria-label="Navegação principal">
          <div className="icaro-sidebar-label">Navegação</div>
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setDrawerOpen(false)}
              aria-current={location === href ? 'page' : undefined}
              className={navClass(href)}
              title={label}
              data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}
            >
              <Icon size={18} strokeWidth={location === href ? 2.4 : 1.8} />
              <span>{label}</span>
              {href === '/assistant' && <span className="icaro-nav-signal" aria-label="Disponível" />}
            </Link>
          ))}
        </nav>

        <div className="icaro-sidebar-bottom">
          {importError && <div role="alert" className="icaro-import-error" data-testid="status-import-error">{importError}</div>}
          <div className="icaro-connection">
            <div className="icaro-connection-title"><span>Conexão</span><span className="icaro-connection-light" aria-hidden="true" /></div>
            <div className="icaro-connection-status" role="status" aria-live="polite"><HeartPulse size={15} /> Prévia local · ativa</div>
            <div className="icaro-connection-caption">Dados sob seu controle</div>
          </div>
          <input
            ref={fileInput}
            className="icaro-file-input"
            type="file"
            accept=".csv,text/csv"
            aria-label="Selecionar arquivo CSV"
            onChange={(event) => { selectFile(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }}
            data-testid="input-csv-file"
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={isImporting}
            aria-busy={isImporting}
            className="icaro-import-button"
            data-testid="button-import-csv"
          >
            <FileUp size={17} /> <span>{isImporting ? 'Lendo arquivo…' : dataset ? 'Trocar CSV' : 'Importar CSV'}</span>
          </button>
          <div className="icaro-preview-links" aria-label="Acessos de prévia">
            <Link href="/login" data-testid="link-preview-login"><LogIn size={14} /> Entrar</Link>
            <Link href="/404" data-testid="link-preview-404"><CircleHelp size={14} /> 404</Link>
          </div>
        </div>
      </aside>

      {drawerOpen && (
        <button
          type="button"
          className="icaro-drawer-scrim"
          onClick={() => { setDrawerOpen(false); drawerTrigger.current?.focus(); }}
          aria-label="Fechar menu"
          data-testid="button-overlay-menu"
        />
      )}

      <nav className="icaro-mobile-nav" aria-label="Navegação móvel">
        {navigation.map(({ href, shortLabel, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={location === href ? 'page' : undefined}
            className={`icaro-mobile-link${location === href ? ' is-current' : ''}`}
            data-testid={`mobile-nav-${shortLabel.toLowerCase().replaceAll(' ', '-')}`}
          >
            <Icon size={19} strokeWidth={location === href ? 2.5 : 1.8} />
            <span>{shortLabel}</span>
          </Link>
        ))}
        <button
          type="button"
          className="icaro-mobile-import"
          onClick={() => fileInput.current?.click()}
          disabled={isImporting}
          aria-label={dataset ? 'Trocar CSV' : 'Importar CSV'}
          data-testid="mobile-button-import-csv"
        >
          <FileUp size={19} /><span>{isImporting ? 'Lendo…' : 'Importar'}</span>
        </button>
      </nav>

      <div className="icaro-shell-main">
        <header className="icaro-topbar">
          <button
            ref={drawerTrigger}
            type="button"
            className="icaro-icon-button icaro-menu-trigger"
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menu"
            aria-expanded={drawerOpen}
            aria-controls="responsive-navigation"
            data-testid="button-open-menu"
          ><Menu size={21} /></button>
          <div className="icaro-local-note"><Activity size={15} /> Espaço local · dados sob seu controle</div>
          <details className="icaro-preview-menu">
            <summary aria-label="Abrir acessos da prévia">Prévia <span aria-hidden="true">⌄</span></summary>
            <div className="icaro-preview-popover">
              <Link href="/login"><LogIn size={15} /> Entrar</Link>
              <Link href="/404"><CircleHelp size={15} /> Página 404</Link>
            </div>
          </details>
          <div className="icaro-user">
            <span className="icaro-username">{user?.username}{user?.role === 'admin' ? ' · Administrador' : ''}</span>
            <span aria-hidden="true" className="icaro-user-avatar">{user?.username.slice(0, 2).toUpperCase() ?? 'IC'}</span>
          </div>
        </header>
        <main className="icaro-content">{children}</main>
      </div>
    </div>
  );
}

function StagePreviewNavigation() {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  return (
    <div className="icaro-stage-switcher">
      <button
        type="button"
        className="icaro-stage-switcher-trigger"
        aria-expanded={open}
        aria-controls="stage-page-links"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="icaro-brand-mark" aria-hidden="true">í</span>
        <span>Páginas</span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <nav id="stage-page-links" className="icaro-stage-switcher-menu" aria-label="Páginas da prévia">
          {primaryNavigation.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={location === href ? 'page' : undefined} onClick={() => setOpen(false)}>
              <Icon size={16} /> {label}
            </Link>
          ))}
          <Link href="/admin/cerebro" onClick={() => setOpen(false)}><Activity size={16} /> Administração</Link>
          <Link href="/login" onClick={() => setOpen(false)}><LogIn size={16} /> Entrar</Link>
          <Link href="/404" onClick={() => setOpen(false)}><CircleHelp size={16} /> Página 404</Link>
        </nav>
      )}
    </div>
  );
}

function DefaultPreviewRoutes() {
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!window.location.hash) navigate('/overview');
  }, [navigate]);
  return <PreviewRoutes />;
}

export function Responsive() {
  return (
    <div className="icaro-app-responsive">
      <PreviewRouter>
        <DatasetProvider>
          <LoginGate key="sample-admin">
            <DefaultPreviewRoutes />
          </LoginGate>
        </DatasetProvider>
      </PreviewRouter>
    </div>
  );
}
