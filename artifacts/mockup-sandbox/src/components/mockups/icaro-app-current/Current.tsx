import { useLocation, PreviewRouter } from './_shared/router';
import { DatasetProvider } from './_shared/lib/dataset-context';
import { LoginGate } from './_shared/login-gate';
import { AppShell } from './_shared/app-shell';
import Stage from './_shared/stage';
import Overview from './_shared/overview';
import Analysis from './_shared/analysis';
import Assistant from './_shared/assistant';
import AdminCerebro from './_shared/admin-cerebro';
import NotFound from './_shared/not-found';
import './_group.css';

function PreviewRoutes() {
  const [location] = useLocation();
  if (location === '/') return <Stage />;
  const page = location === '/overview'
    ? <Overview />
    : location === '/analysis'
      ? <Analysis />
      : location === '/assistant'
        ? <Assistant />
        : location === '/admin/cerebro'
          ? <AdminCerebro />
          : <NotFound />;
  return <AppShell>{page}</AppShell>;
}

export function Current() {
  return (
    <div className="icaro-app-current min-h-screen">
      <PreviewRouter>
        <DatasetProvider>
          <LoginGate key="sample-admin">
            <PreviewRoutes />
          </LoginGate>
        </DatasetProvider>
      </PreviewRouter>
    </div>
  );
}
