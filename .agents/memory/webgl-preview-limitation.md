---
name: WebGL preview limitation
description: The screenshot browser can fail to create WebGL contexts and show only the scene's 2D fallback.
---

The Replit screenshot browser may report that it cannot create WebGL contexts even while the app builds and its workflow runs. The cosmos renderer then displays its procedural 2D fallback. A screenshot can confirm layout and fallback behavior, but it does not prove that live 3D animation works or fails in a normal browser.

**Why:** The WebGL error can come from the capture environment rather than the app, so treating it as a production failure or as proof of 3D success would be misleading.

**How to apply:** When a 3D preview screenshot shows fallback content, report that limitation explicitly and verify the interactive scene in a WebGL-capable browser or signed-in session before claiming the 3D view was visually tested.