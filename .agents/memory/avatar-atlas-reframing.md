---
name: Avatar atlas reframing
description: Why added portrait margins must translate, not rescale, the supplied sprite atlas geometry.
---

Expand the portrait by padding its coordinate space and translating feature positions and anchors. Keep the original face pixels and sprite dimensions together; do not resize atlas feature widths/heights while retaining old sprites.

**Why:** The supplied renderer uses each feature's width and height both as destination geometry and as source sprite-tile stride. Rescaling those numbers changes which pixels are sampled from the sprite sheets and breaks mouth/eye alignment. Generative portrait edits can subtly shift facial features even when instructed not to; compositing the original face back into the generated surroundings preserves lip/eye registration.

**How to apply:** Reframe assets in a separate directory while keeping the supplied library and source assets immutable. Use generated material only outside the original facial coordinate region; keep translated positions consistent across the portrait metadata, eyes, mouth and anchors.