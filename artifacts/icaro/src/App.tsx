import { lazy, Suspense, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { AppShell } from '@/components/app-shell';
import { DatasetProvider } from '@/lib/dataset-context';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LangProvider } from '@/lib/i18n';
import { LoginGate, useAuthUser } from '@/components/login/login-gate';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
const SiteItcont = lazy(() => import('./itcont/SiteItcont'));
const NotFound = lazy(() => import('@/pages/not-found'));
const Stage = lazy(() => import('@/pages/stage'));
const Overview = lazy(() => import('@/pages/overview'));
const Analysis = lazy(() => import('@/pages/analysis'));
const Assistant = lazy(() => import('@/pages/assistant'));
const AdminCerebro = lazy(() => import('@/pages/admin-cerebro'));
const FinanceWeather = lazy(() => import('@/pages/finance-weather'));
const Agenda = lazy(() => import('@/pages/agenda'));
const Music = lazy(() => import('@/pages/music'));
const Demos = lazy(() => import('@/pages/demos'));
const Documentation = lazy(() => import('@/pages/documentation'));

function ehRotaItcont() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const path = window.location.pathname.replace(base, '').replace(/\/$/, '') || '/';
  return path === '/' || path === '/itcont';
}

function Router() {
  const [location] = useLocation();
  return (
    <ErrorBoundary resetKey={location}>
      <Suspense fallback={<div aria-busy="true" />}>
        <Switch>
          <Route path="/icaro" component={Stage} />
          <Route>
            <Shelled />
          </Route>
        </Switch>
      </Suspense>
    </ErrorBoundary>
  );
}

function Shelled() {
  return (
    <AppShell>
      <Switch>
        <Route path="/overview" component={Overview} />
        <Route path="/analysis" component={Analysis} />
        <Route path="/assistant" component={Assistant} />
        <Route path="/finance-weather" component={FinanceWeather} />
        <Route path="/agenda" component={Agenda} />
        <Route path="/music" component={Music} />
        <Route path="/demos" component={Demos} />
        <Route path="/documentation" component={Documentation} />
        <Route path="/admin/cerebro" component={AdminCerebro} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function WithLang() {
  const user = useAuthUser();
  return (
    <LangProvider username={user?.username}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
      </WouterRouter>
    </LangProvider>
  );
}

function App(): ReactNode {
  if (ehRotaItcont()) {
    return (
      <Suspense fallback={<div className="itc" style={{ minHeight: '100dvh' }} />}>
        <SiteItcont />
      </Suspense>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <DatasetProvider>
        <TooltipProvider>
          <LoginGate>
            <WithLang />
          </LoginGate>
          <Toaster />
        </TooltipProvider>
      </DatasetProvider>
    </QueryClientProvider>
  );
}

export default App;
