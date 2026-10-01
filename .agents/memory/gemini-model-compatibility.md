---
name: Gemini model compatibility
description: Observed model availability for direct Google Gemini API calls.
---

On 2026-09-29, a direct Google `generateContent` request using `gemini-2.5-flash` returned HTTP 404 in this project environment; `gemini-3-flash-preview` succeeded.

**Why:** Provider model aliases and availability change over time, and an HTTP 404 may mean the selected model is no longer available rather than that the secret is missing.

**How to apply:** Check the current supported model ID before implementing a direct Gemini request. Keep the model configurable where practical and verify it with one minimal server-side request without logging credentials.