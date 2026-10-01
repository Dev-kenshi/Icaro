---
name: Groq model availability
description: Why public model listings and configured keys are insufficient to confirm a working Groq integration.
---

Confirm the chosen Groq text model with a minimal authenticated server-side chat request before declaring an integration working. Public documentation and the existence of a key do not prove that a particular model is available.

**Why:** A model still advertised in the official catalog returned HTTP 404 with `model_not_found` in this project's actual request. Only a successful request with a different explicitly selected model established that the integration worked.

**How to apply:** Diagnose provider failures using numeric HTTP status and whitelisted error codes, not raw messages or credential-bearing request objects. Check actual account model availability when changing the configuration, then verify a short response. A text-model failure is not evidence that the separate Gemini voice quota has run out.