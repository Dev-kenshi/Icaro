---
name: Voice engine scope
description: Preserve Ícaro's server voice while testing Brazilian Portuguese voices already in the ElevenLabs account.
---

Keep the existing ElevenLabs/Gemini server voice as the default. Do not implement or expose Kokoro until a browser-compatible model with verified Brazilian Portuguese support is available. Defer Kokoro/Piper comparison until a Piper path exists.

**Why:** The user chose to wait rather than expose Kokoro as English-only because Ícaro's normal speech is Portuguese. The currently verified `kokoro-js` ONNX checkpoint is marked English-only; Brazilian Portuguese support and browser compatibility for other multilingual checkpoints have not been verified.

**How to apply:** Preserve the existing server voice and speech settings unchanged. Recheck available Kokoro model language support and browser compatibility before implementation; do not claim a Kokoro/Piper comparison until Piper exists and audio has been tested.

For ElevenLabs comparisons, use voices already available in the user's account. Keep the configured server voice as the default; a test selection must not change it. Do not add public/shared voices or clone a voice without explicit approval.

The first generated Feira/Bahia voice set was rejected by the user as stereotyped. Keep those voices in the ElevenLabs account unless the user asks to delete them, but exclude them from Ícaro's picker and never make them defaults.

**Why:** The user chose account-owned voices for testing, requested male Brazilian Portuguese options with Bahia/Feira de Santana and Emanuel matches, and asked to preserve the current default. No public search result verified a specifically Bahian or Feira de Santana voice.

**How to apply:** For a replacement voice, use a natural, educated male researcher from Feira de Santana: conversational contemporary Brazilian Portuguese with subtle local prosody, no forced slang, catchphrases, drawl, comic delivery, or caricature. Keep the existing server voice as default; present preview audio and let the user choose before saving a new voice to their account. Keep the selected test voice local to the browser. Do not source public/shared voices or clone a real person without explicit approval.

The user approved keeping all three researcher-style options available, rather than choosing a single favorite. Avatar selection must not automatically force one voice.

**Why:** The user explicitly wants to choose and alternate voices independently.

**How to apply:** Preserve all approved options and the existing server default; do not infer a preferred voice from approval of a group.

Provider voice-language filters must use ISO language codes rather than human-readable names.

**Why:** ElevenLabs accepted a human-readable Portuguese language filter with HTTP 200 but returned an empty catalogue, hiding valid account voices.

**How to apply:** Check filtered results against known account voices; successful HTTP status alone does not prove a catalogue filter is correct.