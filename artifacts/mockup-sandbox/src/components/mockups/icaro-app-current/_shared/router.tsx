import { createContext, useContext, useEffect, useState, type AnchorHTMLAttributes, type ReactNode } from 'react';

const LocationContext = createContext<[string, (path: string) => void] | null>(null);

const readLocation = () => window.location.hash.startsWith('#/')
  ? window.location.hash.slice(1)
  : '/';

export function PreviewRouter({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState(readLocation);
  useEffect(() => {
    const update = () => setLocation(readLocation());
    window.addEventListener('popstate', update);
    window.addEventListener('hashchange', update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener('hashchange', update);
    };
  }, []);
  const navigate = (path: string) => {
    window.history.pushState({}, '', `${window.location.pathname}${window.location.search}#${path}`);
    setLocation(path);
  };
  return <LocationContext.Provider value={[location, navigate]}>{children}</LocationContext.Provider>;
}

export function useLocation() {
  const context = useContext(LocationContext);
  if (!context) throw new Error('useLocation must be used inside PreviewRouter');
  return context;
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode };

export function Link({ href, onClick, children, ...props }: LinkProps) {
  const [, navigate] = useLocation();
  return <a {...props} href={href} onClick={(event) => {
    onClick?.(event);
    if (!event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      navigate(href);
    }
  }}>{children}</a>;
}
