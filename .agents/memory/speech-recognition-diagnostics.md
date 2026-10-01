---
name: Browser recognition diagnostics
description: Avoid false browser speech-recognition errors and recognizer conflicts during one-shot microphone tests.
---

When a bounded `SpeechRecognition` diagnostic ends by calling `abort()`, settle the timeout result first and ignore the resulting abort event. If no words arrived, report “no speech,” not a browser or microphone failure. Pause the app's continuous wake recognizer while running the one-shot diagnostic, then restore it only if it was active beforehand and the app is still in browser-recognition mode.

**Why:** Browser recognition can emit `onerror("aborted")` as a consequence of the diagnostic's own timeout; a simultaneous wake listener can also interfere with a second recognition instance. Either can make a working microphone appear broken.

**How to apply:** Any microphone diagnostic that starts its own `SpeechRecognition` should distinguish intentional timeout from external errors and coordinate with the active wake listener. A meter reading alone verifies captured signal, not successful speech transcription or delivery to the AI.