const basePath = document.currentScript?.src
  ? new URL(".", document.currentScript.src).pathname.replace(/\/$/, "")
  : "";
const hasBasePath = basePath && (
  location.pathname === basePath || location.pathname.startsWith(`${basePath}/`)
);
const pagePath = (hasBasePath ? location.pathname.slice(basePath.length) : location.pathname)
  .replace(/\/+$/, "") || "/";
const isItcontRoute = pagePath === "/" || /^\/itcont(?:\/|$)/.test(pagePath);

const routeName = isItcontRoute ? "itcont" : "icaro";
const setRouteIcon = (id, size) => {
  const icon = document.getElementById(id);
  if (icon instanceof HTMLLinkElement) {
    icon.href = `${basePath}/favicon-${routeName}-${size}.png`;
    icon.type = "image/png";
    icon.sizes = `${size}x${size}`;
  }
};
setRouteIcon("route-favicon-16", 16);
setRouteIcon("route-favicon", 32);
setRouteIcon("route-favicon-48", 48);
const appleIcon = document.getElementById("route-apple-icon");
if (appleIcon instanceof HTMLLinkElement) {
  appleIcon.href = `${basePath}/favicon-${routeName}-180.png`;
  appleIcon.type = "image/png";
  appleIcon.sizes = "180x180";
}

if (isItcontRoute) {
  document.documentElement.dataset.itcont = "true";
}

const fontStylesheet = document.getElementById("itcont-google-fonts");
if (fontStylesheet instanceof HTMLLinkElement) {
  fontStylesheet.rel = "stylesheet";
}
