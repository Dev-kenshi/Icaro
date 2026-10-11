---
name: Verifying spoken answers on the Ícaro stage
description: Captions on the Ícaro stage are transient; verify voice answers via the persistent chat log or server TTS logs, and never trust geolocation callbacks in headless browsers.
---

When testing Ícaro stage answers (typed or spoken commands), do not rely on the on-screen caption: it is cleared 2 seconds after the speech ends, so a late check sees nothing. The permanent record is the chat history in Painel do Ícaro → aba "Conversa" (each `say()` appends an entry), and each spoken answer also shows as a `POST /api/tts-ts` in the API Server workflow log.

**Why:** A testing subagent reported "onde estamos?" as unanswered three times while the server logs showed the final answer being synthesized ~8s after each submission — the caption had simply expired before the check.

**How to apply:** Have testers open the conversation panel and read the history, or grep the api-server workflow log for `/api/tts-ts` pairs (acknowledgment + final answer a few seconds apart).

## Headless geolocation hang

Headless Chromium may never call either `getCurrentPosition` callback (no provider, ignored permission prompt), and in iframes without `allow="geolocation"` it can throw `SecurityError` synchronously.

**Why:** The original "onde estamos?" flow awaited geolocation with only the browser's own timeout and hung forever in the test browser.

**How to apply:** Any geolocation wait in this project needs a guard `setTimeout` resolving the fallback plus a synchronous try/catch around the call; the spoken fallback answer must fire even when the browser never responds.
