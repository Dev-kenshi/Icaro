---
name: GitHub sync through the connector
description: Safely update a GitHub branch via the Replit connector when normal Git transport authentication fails.
---

When HTTPS `git push` fails but the Replit GitHub connection can make authenticated API requests, the two credential paths are separate. A Git Database API sync can reproduce file trees and commit messages on the remote, but API-created commits may have new SHAs, leaving the local branch's commit graph divergent even when its tree exactly matches GitHub.

**Why:** REST access from the connector does not provide Git transport credentials; assuming identical commit IDs can cause confusion or unsafe history changes.

**How to apply:** Verify the remote tip and compare complete trees. If the branches have a common ancestor but have diverged, only replace the remote tree with the verified local committed tree when that matches the user's sync request and no independent remote-only files or changes would be lost. Create a new commit parented to the remote tip and advance the ref with `force: false`; recheck the tip immediately before updating it, then verify the remote SHA and tree. Never reset or rewrite local branches without approval.

Only sync committed project files by default. Do not add newly uploaded, untracked attachments to Git unless the user explicitly asks; they may be context or private material rather than project assets.

## Published artifact commits and reference uploads

Artifact publishing can create local commits that include newly uploaded files from `attached_assets/`, even when those files are only conversation references. Inspect every unpublished commit before syncing. If a reference image must stay workspace-only, rebuild the unpushed change without it rather than pushing and following with a deletion commit.

**Why:** A follow-up deletion would remove the image from the branch tip but leave the user's reference image in Git history.

**How to apply:** Preserve the uploaded file locally, exclude it from the replacement commit, and verify it is absent from the remote tree after syncing.

When comparing Git trees through CodeExecution, do not parse raw tab-delimited `git ls-tree` output after it passes through `shellExec`. Convert the fields to a visible delimiter in the shell first.

**Why:** The returned shell output can strip literal tabs, which can make a complete tree comparison appear to contain hundreds of unrelated additions and deletions.

**How to apply:** Format each tree entry as fields separated by a visible character such as `|` before returning it to JavaScript for comparison.

## Ícaro workspace sync expectation

Completed Replit Agent changes for Ícaro should be synchronized to the connected GitHub repository rather than left only in the workspace.

**Why:** The user requested that updates made in this Repl also reach Git automatically.

**How to apply:** Sync completed, verified changes to the connected branch without rewriting history. Replit Auto-sync handles existing commits, not every file save; do not create commits for partial edits or claim per-edit automation unless the Git pane supports it. Before merging, run a read-only Git fetch to verify shell authentication: the Git pane can show OAuth as active while the shell's HTTPS remote still rejects credentials. If fetch fails, stop and have the user reconnect the Git provider before any push or history changes.

**Why:** The Git pane showed GitHub as active and the GitHub App had repository access, but shell fetches still failed authentication. The workspace had no Git credential helper, so UI status alone did not prove CLI access.

For REST-based GitHub writes, use only an API client and connector slug explicitly exposed by the connected integration. A Git source-control connection can mention `connectorFetch` without exposing that callback or an API connector to CodeExecution; do not guess a slug from the connection ID or improvise around missing auth.

**Why:** The OAuth Git pane remained active, but the workspace integration view exposed no REST client after the GitHub App connection was removed.

**How to apply:** Before creating Git trees, commits, or refs, verify that the current Replit connection provides an executable authenticated REST client. If it does not, stop before remote writes and ask for the GitHub API integration to be reconnected.

## Sync Doctor preflight

Before running a sync helper in fix mode, verify that the exact Git transport credential works. A failed authentication check may still create a local commit and export a patch bundle before exiting.

**Why:** A failed fix-mode attempt can change local Git history even when no remote fetch or push succeeds.

**How to apply:** Run a read-only remote access check first. If fix mode stops for authentication, preserve its local commit and export directory, reconnect GitHub through Replit's Git Providers settings, then retry only after Git access succeeds. Exclude generated directories recursively (`:!.sync-out/**`) and test both tracked and untracked contents; excluding only the directory name can still stage its children.

## Shell push credentials (Dev-kenshi/Icaro)

HTTPS push works by injecting a workspace secret through an inline credential helper (`git -c credential.helper='!f() {...}; f' push github main`, username `x-access-token`). As of 2026-10-11: `GIT_Classic` pushes successfully; `GITGUV_TOKEN_ICARO` authenticates but gets 403 (no write permission); `GITHUB_TOKEN` and `GITHUB_NEW` are rejected as invalid. Read-only `git fetch github main` works without any token.

**Why:** The remote has no stored credential helper and each secret has different scope/validity; trying them in order avoids false "auth impossible" conclusions.

**How to apply:** Never echo token values. Loop the candidate secrets through the inline helper, stop at the first non-auth failure string, and re-check permissions when GitHub rotates tokens.