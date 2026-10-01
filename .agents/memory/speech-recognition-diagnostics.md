---
name: Browser recognition diagnostics
description: Avoid false browser speech-recognition errors and recognizer conflicts during one-shot microphone tests.
---

When a bounded `SpeechRecognition` diagnostic ends by calling `abort()`, settle the timeout result first and ignore the resulting abort event. If no words arrived, report “no speech,” not a browser or microphone failure.

For the continuous listener, ignore abort callbacks only after the app has invalidated that recognizer during its own pause/cleanup. An `aborted` event from the still-current recognizer is unexpected: show it, retry with increasing backoff, and reset the failure count only after receiving a non-empty transcript. A successful `start()` event alone does not prove the browser speech service recovered. Pause the continuous listener and wait for its end event before starting a one-shot diagnostic; restore it only if it was active beforehand and the app is still in browser-recognition mode.

**Why:** Browser recognition can emit `onerror("aborted")` as a consequence of an intentional timeout or pause, but silently ignoring an abort from the active recognizer hides real service failures. Repeatedly resetting the retry delay on `onstart` can also create a tight restart loop without ever hearing speech.

**How to apply:** Any microphone diagnostic that starts its own `SpeechRecognition` should distinguish intentional timeout from external errors and coordinate with the active wake listener. Treat a meter reading as proof of captured signal only; validate transcription and delivery separately.