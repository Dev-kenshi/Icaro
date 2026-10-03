---
name: Groq response resilience
description: Why Groq chat responses get bounded retries and sanitized diagnostics.
---

Treat malformed or empty Groq HTTP 200 responses as transient once: normalize OpenAI-style text blocks without stripping whitespace between blocks, and keep the retry within the original request deadline. Log only a reason code, never the upstream response body.

**Why:** A live voice turn completed STT but then failed at chat with an invalid provider response. Retrying once can recover transient responses without hiding persistent failures or exposing user content in logs.

**How to apply:** Preserve the retry limit, overall deadline, spacing-aware block parser, and sanitized reason codes when changing the Groq integration.