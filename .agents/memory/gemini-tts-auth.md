---
name: Gemini TTS authentication
description: Verify the live speech provider instead of trusting configuration flags or cached audio.
---

A present Gemini API secret does not prove Gemini TTS is authorized. The speech status endpoint may report TTS as configured based only on secret presence, and repeated test phrases may be served from cache even when live synthesis returns 401.

**Why:** New assistant answers need a fresh provider request. A cached WAV or mocked browser test can pass while the real provider rejects the credential, leaving text visible but no spoken answer.

**How to apply:** For TTS incidents, send one unique phrase through the same server endpoint the live player uses, bypassing the cache. Report only the HTTP/provider status, never the secret value. Do not silently switch voice families; ask the user to replace the rejected credential through the secure secrets flow.