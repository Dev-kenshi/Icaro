---
name: Voice diagnostic scope
description: What an end-to-end microphone diagnostic must verify before claiming the assistant works.
---

A browser microphone diagnostic should not stop at showing recognized words. To verify Ícaro's core inbound flow, it must confirm the selected activation path (wake phrase or explicitly enabled direct mode), dispatch exactly one authorized question to the actual assistant endpoint, show the returned answer, and record each stage so a later review can distinguish capture, activation, API, and response failures. If the diagnostic does not exercise the app's real audio output path, state clearly that voice playback was not tested.

**Why:** A transcript-only page can look successful while wake handling or the assistant response path is broken; claims that Ícaro works need evidence for each checked stage.

**How to apply:** Keep direct mode opt-in and off by default; preserve the one-question gate for the normal wake path, and report only the stages actually exercised. Preserve server-side status logs so an agent can inspect a user-spoken test after it is run.