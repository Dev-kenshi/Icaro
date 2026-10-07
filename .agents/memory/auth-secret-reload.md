---
name: Auth secret reload
description: A running Replit API workflow can use a different environment snapshot than a fresh test process.
---

When login succeeds in a fresh process but fails through the running preview API, restart the managed API workflow and test again before changing credentials.

**Why:** The fresh-process test accepted the existing credentials while the long-running workflow rejected them; restarting reloaded the environment and restored successful logins without rotating passwords.

**How to apply:** After secret or environment changes, compare a fresh-process login with the live API. Restart the workflow once if they disagree, and never log credential values.
