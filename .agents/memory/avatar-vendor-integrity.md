---
name: Vendor avatar integrity
description: Project rule for intentional customizations to the packaged face and speech engine.
---

Preserve the packaged avatar and speech assets byte-for-byte unless the request explicitly authorizes a face-expression or voice change. When such a change is needed, keep the exception narrow, retain exact integrity checks for every unrelated asset, and assert the intended behavior.

Both Ícaro profiles must share one visual presentation, hologram styling, controls, and speech lifecycle; only the face source may differ.

**Why:** The user explicitly requires visual and functional parity between “Ícaro Feirense” and “Ícaro clássico,” while keeping the existing face and voice behavior stable.

**How to apply:** Keep avatar selection inside the shared face layer. Do not fork stage, layout, controls, or speech initialization by profile. Before editing packaged assets, confirm the request allows it; afterward, verify unrelated assets remain exact.