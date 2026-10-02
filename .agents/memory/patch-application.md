---
name: Patch application behavior
description: Avoid assuming a failed multi-file patch left the workspace unchanged.
---

A failed multi-file patch can still apply changes to some targets while leaving another target untouched. After a failed patch, inspect the diff for every intended file and retry only the remaining changes; if a hunk repeatedly fails, reduce it to minimal context.

**Why:** A multi-file change partially applied, and a broad retry for the remaining file failed while a smaller hunk succeeded. Reapplying the whole change could duplicate or overwrite the files that already changed.

**How to apply:** Check the working-tree diff per target after any failed patch operation before making another edit.