---
name: Gemini TTS authentication
description: Verify the live speech provider instead of trusting configuration flags or cached audio.
---

A present Gemini API secret does not prove Gemini TTS is authorized. The speech status endpoint may report TTS as configured based only on secret presence, and repeated test phrases may be served from cache even when live synthesis returns 401.

When both `gemine` and `GEMINI_API_KEY` are set, prefer `gemine`; this project updates that Secret, while the uppercase alias can be stale.

**Why:** A fresh cache-miss request succeeded after the resolver began using the updated `gemine` value. A cached WAV, mocked browser test, or stale alias can otherwise hide a working credential or leave text visible without spoken output.

**How to apply:** For TTS auth incidents, confirm alias priority, restart the API, then send one unique phrase through the live endpoint. Report only the HTTP/provider status, never the secret value. Do not silently switch voice families or request a new key until that fresh request proves the selected credential is rejected.