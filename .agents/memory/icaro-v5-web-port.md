---
name: Ícaro v5 web port
description: User chose to adapt the supplied Windows desktop Ícaro v5 project into the existing web application.
---

Port the compatible v5 experience into the existing React/Vite and API application rather than replacing it with a parallel Python desktop app. Keep direct Windows file, PowerShell, and process control out of the web server; any replacement must be scoped to safe app-owned data and explicit user authorization.

**Why:** The user selected the existing web app as the target, while the ZIP's `.bat` launchers and host-computer operator depend on Windows and cannot run safely from the Replit Linux server.

**How to apply:** Compare the ZIP manual against existing web capabilities before adding duplicates. Preserve auth, current avatar/voice behavior, and local privacy rules; adapt only web-compatible features, and identify platform-specific gaps plainly.
