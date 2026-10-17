---
name: Ícaro command test maze
description: Durable test expectations for the legacy and v5 voice-command paths.
---

The Ícaro command checks cover the legacy interpretation path, the direct v5 command layer, and their integrated routing. The test runner must finish all checks before printing a single final `OK` or `NOK`, and should stay local and deterministic without provider or database calls.

**Why:** The user explicitly chose the legacy commands plus the v5 additions as the two versions to compare. Overlapping natural phrases can be misrouted even when the version-specific happy paths pass.

**How to apply:** When changing command parsing or routing, update and run the full maze plus the relevant geographic and v5 regressions. Keep external API calls and state mutation out of the maze itself.
