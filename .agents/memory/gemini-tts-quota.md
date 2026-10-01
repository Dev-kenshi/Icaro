---
name: Gemini TTS free-tier quota
description: Why the ÍCARO voice turned robotic and the constraints any TTS change must respect.
---

Gemini TTS free tier allows ~10 requests per minute **per model** (429 with a retryDelay of ~30 s). Quotas are separate per model, so rotating across TTS models that share the same prebuilt voice keeps the voice identical. Observed 2026-09-30: gemini-2.5-flash-preview-tts, gemini-3.1-flash-tts-preview, gemini-3.8-flash-tts and gemini-3.8-flash-lite-tts work with Charon; gemini-2.5-pro-preview-tts has limit 0. The 3.8 models return a ready WAV; the others return raw PCM L16 24 kHz.

**Why:** One request per sentence exhausted the quota and the client fell back to the robotic browser voice. The user approved the Gemini Charon voice and explicitly dislikes the voice changing mid-conversation.

**How to apply:** Never add cross-family voice fallback. Keep requests per answer low (group sentences), keep caching, and keep the cache key independent of the model so rotation reuses cached audio.
