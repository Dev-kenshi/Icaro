---
name: Voice command lifetime
description: Use explicit completion to release voice-command guards, not an elapsed-time window.
---

Release a voice-command lock when its response has actually completed or been canceled. Do not keep the lock for a fixed minimum time after submission.

**Why:** Fast local responses and text-only responses can finish before a time-based lock expires. The next valid question can then be misclassified as playback echo and permanently discarded.

**How to apply:** For continuous conversations, distinguish segments genuinely heard during playback from speech after command completion. Include a regression where the next question begins immediately after a fast response.