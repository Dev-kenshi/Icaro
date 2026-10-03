---
name: Voice engine scope
description: Product decision for the optional Kokoro browser voice and future Piper comparison.
---

Keep the existing ElevenLabs/Gemini server voice as the default. Offer Kokoro as an optional browser-local engine; defer any Kokoro/Piper comparison until a Piper path exists.

**Why:** The user chose to add Kokoro beside the current voice rather than implement Piper or pause Kokoro, because the current checkout has no Piper implementation and an audio comparison cannot yet be made.

**How to apply:** Keep engine selection opt-in, preserve the existing server path, and do not claim a Piper comparison until Piper is implemented and audio-tested.