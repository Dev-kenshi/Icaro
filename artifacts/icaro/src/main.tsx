import { createRoot } from 'react-dom/client';
import type { ComponentType } from 'react';
import { ErrorBoundary } from '@/components/error-boundary';
import { applyRouteFavicon, faviconRouteForPath } from '@/lib/route-favicons';

applyRouteFavicon(
  faviconRouteForPath(window.location.pathname, import.meta.env.BASE_URL),
  import.meta.env.BASE_URL,
);

const root = createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
});
const mount = (Page: ComponentType) => root.render(<ErrorBoundary><Page /></ErrorBoundary>);

// Keep the public ITCONT route out of the authenticated app's initial bundle.
if (/^\/itcont(?:\/|$)/.test(window.location.pathname)) {
  root.render(<div className="itc" aria-busy="true" style={{ minHeight: '100dvh' }} />);
  void import('./itcont/SiteItcont').then(({ default: SiteItcont }) => mount(SiteItcont));
} else {
  void Promise.all([import('./index.css'), import('./App')]).then(([, { default: App }]) => mount(App));
}
