---
name: GitHub sync through the connector
description: Safely update a GitHub branch via the Replit connector when normal Git transport authentication fails.
---

When HTTPS `git push` fails but the Replit GitHub connection can make authenticated API requests, the two credential paths are separate. A Git Database API sync can reproduce file trees and commit messages on the remote, but API-created commits may have new SHAs, leaving the local branch's commit graph divergent even when its tree exactly matches GitHub.

**Why:** REST access from the connector does not provide Git transport credentials; assuming identical commit IDs can cause confusion or unsafe history changes.

**How to apply:** Verify the remote tip, require the local branch to descend linearly from it and the worktree to be clean, create blobs/trees/commits via the API, advance the ref with `force: false`, and verify both the remote SHA and tree. Keep any local-history mismatch explicit; do not reset or rewrite local branches without the user's approval.