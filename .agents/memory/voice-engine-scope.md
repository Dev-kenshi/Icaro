---
name: Voice engine scope
description: Product decision for the optional Kokoro browser voice and future Piper comparison.
---

Keep the existing ElevenLabs/Gemini server voice as the default. Do not implement or expose Kokoro until a browser-compatible model with verified Brazilian Portuguese support is available. Defer voice comparison until a Piper path exists.

**Why:** The user chose to wait rather than expose Kokoro as English-only because Ícaro's normal speech is Portuguese. The currently verified `kokoro-js` ONNX checkpoint is marked English-only; Brazilian Portuguese support and browser compatibility for other multilingual checkpoints have not been verified.

**How to apply:** Preserve the existing server voice and speech settings unchanged. Recheck available Kokoro model language support and browser compatibility before implementation; do not claim a Kokoro/Piper comparison until Piper exists and audio has been tested.

For ElevenLabs, use a voice that already exists in the user's account and has been explicitly selected. Do not upload or clone the bundled voice sample.

**Why:** The user chose direct API-key integration without changing plans and explicitly selected an existing account voice instead of cloning the project sample.

**How to apply:** Obtain the account's voice list through a server-side request that does not expose the API key, ask the user to choose, and configure only that voice ID.