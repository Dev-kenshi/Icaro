---
name: Cosmos public asset availability
description: Verified public NASA map endpoints and Solar System Scope texture delivery behavior for Ícaro's cosmos scene.
---

Use NASA GIBS WMS for the Earth day map, night lights, and cloud layer; those sources returned valid images with CORS enabled in this environment. Solar System Scope texture downloads can return HTTP 202 CAPTCHA pages instead of image files, even with browser-like request headers, so the scene must retain procedural planet textures and report when it is using fallback assets.

**Why:** A configured public URL is not proof the browser received a usable image. Relying on blocked textures would leave planets blank or create confusing asset errors.

**How to apply:** When updating the cosmos visuals, keep the NASA GIBS path and graceful procedural fallback; verify image content and CORS before removing fallbacks or claiming the external textures loaded.