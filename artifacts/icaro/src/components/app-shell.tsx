import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Activity, BarChart3, BrainCircuit, CalendarDays, CircleDollarSign, Database, FileUp, Gauge, HeartPulse, Menu, X } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { getGetAiStatusQueryKey, getHealthCheckQueryKey, useGetAiStatus, useHealthCheck } from '@workspace/api-client-react';
import { useDataset } from '@/lib/dataset-context';
import { Button } from '@/components/ui/button';
import { useAuthUser, useAuthSignOut } from '@/components/login/login-gate';

const navigation = [
  { href: '/overview', label: 'Visão geral', icon: Gauge },
  { href: '/analysis', label: 'Explorar dados', icon: BarChart3 },
  { href: '/assistant', label: 'Copiloto', icon: BrainCircuit },
  { href: '/finance-weather', label: 'Finanças', icon: CircleDollarSign },
  { href: '/agenda', label: 'Agenda', icon: CalendarDays },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const user = useAuthUser();
  const signOut = useAuthSignOut();
  const [mobileOpen, setMobileOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const { dataset, importCsv, isImporting, importError } = useDataset();
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey() } });
  const providers = useGetAiStatus({ query: { queryKey: getGetAiStatusQueryKey() } });

  useEffect(() => {
    if (!mobileOpen) return;
    document.querySelector<HTMLElement>('#app-navigation a')?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
        menuTrigger.current?.focus();
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileOpen]);

  const handleFile = (file?: File) => {
    if (file) void importCsv(file);
  };

  return (
    <div className="icaro-app-shell min-h-[100dvh] bg-background text-foreground">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[256px] flex-col bg-sidebar text-sidebar-foreground transition-transform duration-300 md:w-[84px] md:items-center md:translate-x-0 xl:w-[256px] xl:items-stretch ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-6 py-6 md:w-full md:justify-center md:px-2 xl:justify-between xl:px-6">
          <Link href="/" className="flex items-center gap-3" data-testid="link-brand">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">í</span>
            <span className="font-display text-2xl tracking-tight md:hidden xl:inline">Ícaro</span>
          </Link>
          <button type="button" className="rounded-lg p-2 md:hidden" onClick={() => { setMobileOpen(false); menuTrigger.current?.focus(); }} aria-label="Fechar menu" data-testid="button-close-menu"><X size={18} /></button>
        </div>
        <div className="w-full px-4 md:px-2 xl:px-4">
          <div className="mb-7 rounded-xl border border-sidebar-border bg-sidebar-accent/70 p-3 md:hidden xl:block">
            <div className="flex items-center gap-2 text-[11px] font-mono-data uppercase tracking-[.14em] text-sidebar-foreground/55"><Database size={13} /> CSV ativo</div>
            <div className="mt-2 truncate text-sm font-semibold" data-testid="text-active-dataset">{dataset?.name ?? 'Nenhum arquivo importado'}</div>
            <div className="mt-1 text-xs text-sidebar-foreground/55">{dataset ? dataset.summary : 'Importe um CSV para começar'}</div>
          </div>
          <nav id="app-navigation" className="space-y-1 md:w-full md:space-y-2 xl:space-y-1" aria-label="Navegação principal">
            <div className="mb-2 px-3 text-[10px] font-mono-data uppercase tracking-[.16em] text-sidebar-foreground/40 md:hidden xl:block">Navegação</div>
            {[...navigation, ...(user?.role === 'admin' ? [{ href: '/admin/cerebro', label: 'Administração', icon: Activity }] : [])].map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} onClick={() => setMobileOpen(false)} aria-label={label} aria-current={location === href ? 'page' : undefined} title={label} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors md:justify-center md:px-0 xl:justify-start xl:px-3 ${location === href ? 'bg-sidebar-primary text-sidebar-primary-foreground font-semibold' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}>
                <Icon size={17} strokeWidth={location === href ? 2.4 : 1.8} /><span className="md:hidden xl:inline">{label}</span>
                {href === '/assistant' && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent md:hidden xl:block" />}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-auto w-full space-y-3 px-4 pb-5 md:space-y-2 md:px-2 xl:space-y-3 xl:px-4">
          {importError && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive" data-testid="status-import-error">{importError}</div>}
          <div className="rounded-xl border border-sidebar-border p-3 text-xs md:hidden xl:block">
            <div className="mb-2 flex items-center justify-between text-sidebar-foreground/60"><span className="font-mono-data uppercase tracking-wider">Conexão</span><span className={`h-2 w-2 rounded-full ${health.isError ? 'bg-destructive' : 'bg-sidebar-primary animate-pulse-soft'}`} /></div>
            <div role="status" aria-live="polite" className="flex items-center gap-2 text-sidebar-foreground/80"><HeartPulse size={14} />{health.isLoading ? 'Verificando API…' : health.isError ? 'API indisponível' : 'API operacional'}</div>
            <div role={providers.isError ? 'alert' : 'status'} className="mt-1 text-sidebar-foreground/45">{providers.isLoading ? 'Verificando provedores de IA…' : providers.isError ? 'Não foi possível consultar os provedores' : providers.data ? `${providers.data.providers.filter((provider) => provider.configured).length} provedor(es) configurado(s)` : 'Status de IA indisponível'}</div>
            {(health.isError || providers.isError) && <button type="button" onClick={() => { void health.refetch(); void providers.refetch(); }} className="mt-2 text-xs font-semibold text-sidebar-primary underline underline-offset-2" data-testid="button-retry-connection">Tentar novamente</button>}
          </div>
          <input ref={fileInput} className="hidden" type="file" accept=".csv,text/csv" aria-label="Selecionar arquivo CSV" onChange={(event) => { handleFile(event.target.files?.[0]); event.currentTarget.value = ''; }} data-testid="input-csv-file" />
          <Button type="button" onClick={() => fileInput.current?.click()} disabled={isImporting} aria-busy={isImporting} aria-label={dataset ? 'Trocar CSV' : 'Importar CSV'} title={dataset ? 'Trocar CSV' : 'Importar CSV'} className="w-full justify-center gap-2 rounded-xl bg-sidebar-primary font-semibold text-sidebar-primary-foreground hover:bg-sidebar-primary/90 md:mx-auto md:h-12 md:w-12 md:px-0 xl:mx-0 xl:h-auto xl:w-full xl:px-3" data-testid="button-import-csv">
            <FileUp size={16} /> <span className="md:hidden xl:inline">{isImporting ? 'Lendo arquivo…' : dataset ? 'Trocar CSV' : 'Importar CSV'}</span>
          </Button>
        </div>
      </aside>
      {mobileOpen && <button type="button" className="fixed inset-0 z-30 bg-sidebar/40 md:hidden" onClick={() => { setMobileOpen(false); menuTrigger.current?.focus(); }} aria-label="Fechar menu" data-testid="button-overlay-menu" />}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-border bg-card/95 px-2 pt-1 shadow-[0_-8px_28px_rgba(31,60,51,.10)] backdrop-blur-xl md:hidden" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 6px)' }} aria-label="Navegação móvel">
        {[...navigation, ...(user?.role === 'admin' ? [{ href: '/admin/cerebro', label: 'Admin', icon: Activity }] : [])].map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={location === href ? 'page' : undefined} className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold ${location === href ? 'text-secondary' : 'text-muted-foreground'}`} data-testid={`mobile-nav-${label.toLowerCase().replaceAll(' ', '-')}`}>
            <Icon size={19} strokeWidth={location === href ? 2.5 : 1.8} /><span className="max-w-full truncate">{label}</span>
          </Link>
        ))}
        <button type="button" onClick={() => fileInput.current?.click()} disabled={isImporting} className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold text-accent-foreground disabled:opacity-50" aria-label={dataset ? 'Trocar CSV' : 'Importar CSV'} data-testid="mobile-button-import-csv">
          <FileUp size={19} /><span className="max-w-full truncate">{isImporting ? 'Lendo…' : 'Importar'}</span>
        </button>
      </nav>
      <div className="md:pl-[84px] xl:pl-[256px]">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-border/80 bg-background/90 px-4 backdrop-blur-md sm:px-5 xl:px-10">
          <button ref={menuTrigger} type="button" className="rounded-lg p-2 hover:bg-muted md:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menu" aria-expanded={mobileOpen} aria-controls="app-navigation" data-testid="button-open-menu"><Menu size={21} /></button>
          <div className="hidden items-center gap-2 text-xs text-muted-foreground xl:flex"><Activity size={14} className="text-secondary" /> Espaço local · dados sob seu controle</div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">{user?.username}{user?.role === 'admin' ? ' · Administrador' : ''}</span>
            <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{user?.username.slice(0, 2).toUpperCase() ?? 'IC'}</span>
            <button type="button" onClick={() => signOut?.()} aria-label={`Sair da conta ${user?.username ?? ''}`} title="Sair da conta" className="min-h-10 rounded-lg border border-border/80 px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:border-secondary hover:bg-muted hover:text-foreground md:min-h-11" data-testid="button-logout-shell">Sair</button>
          </div>
        </header>
        <main className="mx-auto max-w-[1480px] px-4 pb-28 pt-6 sm:px-6 md:pb-8 xl:px-10 xl:py-10">{children}</main>
      </div>
    </div>
  );
}
