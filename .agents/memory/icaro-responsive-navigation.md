---
name: Ícaro responsive navigation
description: Device-specific navigation model and sign-out placement for the redesigned Ícaro interface.
---

Use three responsive modes: phones use a drawer and bottom navigation, tablets use a compact icon rail, and wide desktop screens use the full labeled sidebar. In the standard app shell, place sign-out in the header so it does not cover work; keep stage-specific exit handling separate.

**Why:** The Nielsen redesign needs distinct navigation patterns without hiding analytical content or obscuring the mobile navigation.

**How to apply:** Preserve these modes when changing shell breakpoints or adding routes. Keep icon-only controls accessible by name and provide visible labels at wider widths.
