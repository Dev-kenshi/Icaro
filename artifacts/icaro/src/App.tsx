import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { AppShell } from '@/components/app-shell';
import { DatasetProvider } from '@/lib/dataset-context';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Stage from '@/pages/stage';
import Overview from '@/pages/overview';
import Analysis from '@/pages/analysis';
import Assistant from '@/pages/assistant';
import AdminCerebro from '@/pages/admin-cerebro';
import FinanceWeather from '@/pages/finance-weather';
import Agenda from '@/pages/agenda';
import Music from '@/pages/music';
import { LoginGate } from '@/components/login/login-gate';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();

function Router() {
  const [location] = useLocation();
  return (
    <ErrorBoundary resetKey={location}>
      <Switch>
        <Route path="/" component={Stage} />
        <Route>
          <Shelled />
        </Route>
      </Switch>
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
        <Route path="/admin/cerebro" component={AdminCerebro} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function App(): ReactNode {
  return (
    <QueryClientProvider client={queryClient}>
      <DatasetProvider>
        <TooltipProvider>
          <LoginGate>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
              <Router />
            </WouterRouter>
          </LoginGate>
          <Toaster />
        </TooltipProvider>
      </DatasetProvider>
    </QueryClientProvider>
  );
}

export default App;
