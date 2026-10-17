const basePath = document.currentScript?.src
  ? new URL(".", document.currentScript.src).pathname.replace(/\/$/, "")
  : "";
const pagePath = location.pathname.replace(basePath, "").replace(/\/$/, "") || "/";

if (pagePath === "/" || pagePath === "/itcont") {
  document.documentElement.dataset.itcont = "true";
  const icon = document.querySelector('link[rel="icon"]');
  if (icon) {
    icon.href = `${basePath}/itcont-event-logo.png`;
    icon.type = "image/png";
  }
}

const fontStylesheet = document.getElementById("itcont-google-fonts");
if (fontStylesheet instanceof HTMLLinkElement) {
  fontStylesheet.rel = "stylesheet";
}
