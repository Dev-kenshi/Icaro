---
name: Voice engine scope
description: Preserve Ícaro's server voice while testing Brazilian Portuguese voices already in the ElevenLabs account.
---

Keep the existing ElevenLabs/Gemini server voice as the default. Do not implement or expose Kokoro until a browser-compatible model with verified Brazilian Portuguese support is available. Defer Kokoro/Piper comparison until a Piper path exists.

**Why:** The user chose to wait rather than expose Kokoro as English-only because Ícaro's normal speech is Portuguese. The currently verified `kokoro-js` ONNX checkpoint is marked English-only; Brazilian Portuguese support and browser compatibility for other multilingual checkpoints have not been verified.

**How to apply:** Preserve the existing server voice and speech settings unchanged. Recheck available Kokoro model language support and browser compatibility before implementation; do not claim a Kokoro/Piper comparison until Piper exists and audio has been tested.

For ElevenLabs comparisons, use voices already available in the user's account. Keep the configured server voice as the default; a test selection must not change it. Do not add public/shared voices or clone a voice without explicit approval.

**Why:** The user chose account-owned voices for testing, requested male Brazilian Portuguese options with Bahia/Feira de Santana and Emanuel matches, and asked to preserve the current default. No public search result verified a specifically Bahian or Feira de Santana voice.

**How to apply:** Load account voices server-side without exposing the API key and validate any test voice ID against that account. Keep the selected test voice local to the browser; when no test voice is selected, use the configured server default. If no account voice matches, ask before sourcing or adding a public/shared voice.