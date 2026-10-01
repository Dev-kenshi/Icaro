---
name: Vendor speech lifetime
description: Isolate the uploaded speech player's mutable queue for each reply while retaining one unlocked AudioContext.
---

Use a fresh supplied speech-player instance for each reply, with a shared unlocked audio graph and run-owned callbacks. Do not reuse a stopped instance for the next reply.

**Why:** The supplied player resumes old asynchronous pumps after stop, decrementing counters and clearing pump locks that were reset for a new reply. This can strand completion or duplicate playback. Callback tokens alone do not protect those internal counters.

**How to apply:** Keep the supplied library unchanged and isolate its queues in the integration adapter. Stale engines must not update the real avatar, captions or current completion state. Attach handlers to prefetched promises immediately. Mouth timelines must be renewed for every sentence, not just the first.