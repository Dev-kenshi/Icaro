---
name: GitHub sync through the connector
description: Safely update a GitHub branch via the Replit connector when normal Git transport authentication fails.
---

When HTTPS `git push` fails but the Replit GitHub connection can make authenticated API requests, the two credential paths are separate. A Git Database API sync can reproduce file trees and commit messages on the remote, but API-created commits may have new SHAs, leaving the local branch's commit graph divergent even when its tree exactly matches GitHub.

**Why:** REST access from the connector does not provide Git transport credentials; assuming identical commit IDs can cause confusion or unsafe history changes.

**How to apply:** Verify the remote tip and compare complete trees. If the branches have a common ancestor but have diverged, only replace the remote tree with the verified local committed tree when that matches the user's sync request and no independent remote-only files or changes would be lost. Create a new commit parented to the remote tip and advance the ref with `force: false`; recheck the tip immediately before updating it, then verify the remote SHA and tree. Never reset or rewrite local branches without approval.

Only sync committed project files by default. Do not add newly uploaded, untracked attachments to Git unless the user explicitly asks; they may be context or private material rather than project assets.

When comparing Git trees through CodeExecution, do not parse raw tab-delimited `git ls-tree` output after it passes through `shellExec`. Convert the fields to a visible delimiter in the shell first.

**Why:** The returned shell output can strip literal tabs, which can make a complete tree comparison appear to contain hundreds of unrelated additions and deletions.

**How to apply:** Format each tree entry as fields separated by a visible character such as `|` before returning it to JavaScript for comparison.

## Ícaro workspace sync expectation

Completed Replit Agent changes for Ícaro should be synchronized to the connected GitHub repository rather than left only in the workspace.

**Why:** The user requested that updates made in this Repl also reach Git automatically.

**How to apply:** Sync completed, verified changes to the connected branch without rewriting history. Replit Auto-sync handles existing commits, not every file save; do not create commits for partial edits or claim per-edit automation unless the Git pane supports it. Before merging, run a read-only Git fetch to verify shell authentication: the Git pane can show OAuth as active while the shell's HTTPS remote still rejects credentials. If fetch fails, stop and have the user reconnect the Git provider before any push or history changes.

**Why:** The Git pane showed GitHub as active and the GitHub App had repository access, but shell fetches still failed authentication. The workspace had no Git credential helper, so UI status alone did not prove CLI access.