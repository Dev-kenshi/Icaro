---
name: Shared Ícaro globe
description: Product decision for reusing the existing MapLibre Earth between the signed-in stage and the public ITCONT site.
---

The ITCONT public site should reuse the Ícaro stage's `GloboTerra` and `CosmosRenderer` system scene; do not create or maintain parallel 3D implementations. With reduced motion, mount both scenes in a paused frame; show CSS stars only when WebGL is unavailable or the globe fails.

**Why:** The user wants the same Earth and solar-system visuals in both places, with reduced-motion visitors still seeing the scenes and able to opt into motion.

**How to apply:** Load the public layers on demand; keep stage defaults unchanged. Respect reduced motion by default, persist an explicit public-site opt-in safely, and reserve CSS stars for no-WebGL or globe-failure cases.
