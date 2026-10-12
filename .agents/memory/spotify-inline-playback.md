---
name: Spotify inline playback
description: Spotify's official embedded player API and browser autoplay limitations.
---

Use Spotify's official embedded player and iFrame API for playback within Ícaro. Keep a visible play control that the user can press directly; playback initiated asynchronously by voice navigation or component effects may be blocked by browser autoplay policy. Spotify login, track availability, and any account requirements remain controlled by Spotify.

**Why:** The browser may reject audio started after a delayed route change, even when the app requested autoplay. The Spotify embed still provides its own controls as a fallback.

**How to apply:** Keep the in-page embed as the source of playback and provide a direct user-gesture play action. Do not promise guaranteed voice-triggered autoplay across browsers.
