export type FaviconRoute = "itcont" | "icaro";

export function stripBasePath(pathname: string, baseUrl = "/"): string {
  const basePath = baseUrl.replace(/\/+$/, "");
  if (!basePath) return pathname || "/";
  if (pathname === basePath) return "/";
  if (pathname.startsWith(`${basePath}/`)) return pathname.slice(basePath.length) || "/";
  return pathname || "/";
}

export function isItcontRoute(pathname: string): boolean {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  return normalizedPath === "/" || /^\/itcont(?:\/|$)/.test(normalizedPath);
}

export function faviconRouteForPath(pathname: string, baseUrl = "/"): FaviconRoute {
  return isItcontRoute(stripBasePath(pathname, baseUrl)) ? "itcont" : "icaro";
}

export function routeFaviconPaths(route: FaviconRoute, baseUrl = "/"): {
  favicon16: string;
  favicon: string;
  favicon48: string;
  appleTouchIcon: string;
} {
  const basePath = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return {
    favicon16: `${basePath}favicon-${route}-16.png`,
    favicon: `${basePath}favicon-${route}-32.png`,
    favicon48: `${basePath}favicon-${route}-48.png`,
    appleTouchIcon: `${basePath}favicon-${route}-180.png`,
  };
}

export function applyRouteFavicon(
  route: FaviconRoute,
  baseUrl: string,
  documentRef: Document = document,
): void {
  const paths = routeFaviconPaths(route, baseUrl);
  const upsertLink = (id: string, rel: string, sizes: string, href: string): void => {
    let link = documentRef.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = documentRef.createElement("link");
      link.id = id;
      documentRef.head.appendChild(link);
    }
    link.rel = rel;
    link.type = "image/png";
    link.sizes = sizes;
    link.href = href;
  };

  upsertLink("route-favicon-16", "icon", "16x16", paths.favicon16);
  upsertLink("route-favicon", "icon", "32x32", paths.favicon);
  upsertLink("route-favicon-48", "icon", "48x48", paths.favicon48);
  upsertLink("route-apple-icon", "apple-touch-icon", "180x180", paths.appleTouchIcon);
}
