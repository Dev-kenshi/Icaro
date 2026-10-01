---
name: Local knowledge matching
description: Keep deterministic local answers specific to the user's subject instead of letting question wording dominate a match.
---

When ranking local knowledge triggers, score distinctive subject terms above question stems and request verbs. Broad prompts such as "explain accounting" must not outrank a specific topic such as "accounting costs" just because their trigger contains more words.

**Why:** A too-generic local hit prevents the remote provider from receiving a question the local bank cannot actually answer.

**How to apply:** Add natural-language variants for specific topics, treat interrogatives and verbs such as "explain" or "define" as filler during specificity ranking, and test both a generic question and the specific form with each relevant verb.