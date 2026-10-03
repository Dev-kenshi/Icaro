---
name: Voice engine scope
description: Product decision for the optional Kokoro browser voice and future Piper comparison.
---

Keep the existing ElevenLabs/Gemini server voice as the default. Do not implement or expose Kokoro until a browser-compatible model with verified Brazilian Portuguese support is available. Defer voice comparison until a Piper path exists.

**Why:** The user chose to wait rather than expose Kokoro as English-only because Ícaro's normal speech is Portuguese. The currently verified `kokoro-js` ONNX checkpoint is marked English-only; Brazilian Portuguese support and browser compatibility for other multilingual checkpoints have not been verified.

**How to apply:** Preserve the existing server voice and speech settings unchanged. Recheck available Kokoro model language support and browser compatibility before implementation; do not claim a Kokoro/Piper comparison until Piper exists and audio has been tested.