---
name: Voice output activation
description: Browser microphone access and audible Web Audio output are separate controls and failure paths.
---

Keep voice-output activation separate from microphone permission and from the app's voice-enabled preference. Provide a direct user-gesture action that resumes the shared `AudioContext`, plays an audible neural-voice check, and reports failures visibly; do not assume mic interaction unlocked speaker output. Captions can remain optional and hidden by default without disabling audio.

**Why:** The stage can be blocked by microphone permission while the user still needs to activate speaker output; a voice preference set to “on” does not prove the browser allowed audio playback.

**How to apply:** Validate the full output chain in Chromium (running context, decoded non-silent buffer, source→analyser→destination, start/end and retry), then check the physical device separately because headless tests cannot verify speakers, OS volume, or routing.