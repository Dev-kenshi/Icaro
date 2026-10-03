---
name: Vendor avatar integrity
description: Project rule for intentional customizations to the packaged face and speech engine.
---

Preserve the packaged avatar and speech assets byte-for-byte unless the request explicitly authorizes a face-expression or voice change. When such a change is needed, keep the exception narrow, retain exact integrity checks for every unrelated asset, and assert the intended behavior.

**Why:** The user expects the existing face, voice, microphone, and local wake behavior to remain stable except for explicitly requested expression or voice changes.

**How to apply:** Before editing packaged assets, confirm the requested scope allows that surface. Afterward, verify unrelated package assets remain exact and test only the newly authorized behavior in the changed files.