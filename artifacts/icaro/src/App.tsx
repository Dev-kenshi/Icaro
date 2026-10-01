import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { AppShell } from '@/components/app-shell';
import { DatasetProvider } from '@/lib/dataset-context';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Stage from '@/pages/stage';
import MicTest from '@/pages/mic-test';
import Analysis from '@/pages/analysis';
import Assistant from '@/pages/assistant';
import { LoginGate } from '@/components/login/login-gate';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();

function Router() {
  const [location] = useLocation();
  return (
    <ErrorBoundary resetKey={location}>
      <Switch>
        <Route path="/" component={Stage} />
        <Route path="/mic-test" component={MicTest} />
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
        <Route path="/analysis" component={Analysis} />
        <Route path="/assistant" component={Assistant} />
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
