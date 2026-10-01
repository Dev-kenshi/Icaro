---
name: Gemini model compatibility
description: Observed model availability for direct Google Gemini API calls.
---

On 2026-09-29, a direct Google `generateContent` request using `gemini-2.5-flash` returned HTTP 404 in this project environment; `gemini-3-flash-preview` succeeded.

As of 2026-10-01, Google's current Gemini TTS guide lists `gemini-3.8-flash-tts` and `gemini-3.8-flash-lite-tts`; the REST body uses `generationConfig.speechConfig.voiceConfig.voice`. The older `prebuiltVoiceConfig.voiceName` shape is not the documented 3.8 TTS contract.

**Why:** Provider model aliases and availability change over time, and request schemas can change with newer model families. An HTTP 404 may mean the selected model is no longer available; a 400 may mean the body does not match the model contract.

**How to apply:** Check the current supported model ID and request schema together before implementing a direct Gemini request. Keep the model configurable where practical and verify it with one minimal, uncached server-side request without logging credentials.