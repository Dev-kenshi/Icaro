---
name: Voice activation policy
description: Deliberate wake activation is permission for one question, not an indefinitely open conversation.
---

Each “Ok, Ícaro” or “Let’s go, Ícaro” authorizes one question. After receiving that question, disarm immediately and return to standby after the reply. Empty activations must expire without speaking.

Treat wake phrases as commands only at the beginning of an utterance; ambient mentions must not activate the assistant or send audio to the AI.

**Why:** The user clarified the expected hands-free flow and asked for “Let’s go, Ícaro” as an activation phrase, while retaining the existing privacy boundary.

**How to apply:** Add wake aliases to the same one-question turn gate, update the spoken instructions, and test that the phrase activates the listening state before a separate question is submitted.

**Why:** Indefinite activation let ambient conversations and the assistant's delayed self-transcription trigger unsolicited replies. The user explicitly reported Ícaro speaking when no question had been asked.

**How to apply:** Keep Stop available during playback, but ignore other playback results, including final transcripts delivered after playback ends. If an interim result is suppressed as echo, keep its recognition index suppressed through the final revision; browser speech recognition can revise the same index after the echo guard expires. A wake phrase mentioned inside another sentence is not addressing the assistant. Tests must cover an empty wake, ambient speech after completion and interim/final playback echoes.

Use explicit command completion, not an arbitrary minimum command lock. A brief output-echo guard may follow actual audio playback; text-only responses must not incur that guard.

For a manual activation, wait for actual recognition startup before opening the question window or showing active listening. Keep that pending gesture separate from completion of a previous response.

**Why:** A browser permission prompt can take longer than the question window; counting from the click discards the activation before the microphone is ready. Completion of an older response must not cancel that pending new activation.

**How to apply:** Recognition readiness and permission to ask are distinct states. Blocked capture must surface actionable help, not an apparently listening microphone. A child iframe cannot grant itself a parent-denied microphone policy; offer the same app in a new tab instead.

A deliberate new wake may cancel an outstanding answer or voice preparation while no audio is playing. Keep playback/intro and delayed echoes protected.

**Why:** TTS quota failures can leave voice preparation waiting for a long time; treating that wait as playback makes the wake command appear broken.

**How to apply:** Only the non-playing waiting state is interruptible. Ordinary ambient speech must not release a pending question, and the newly activated turn still authorizes just one question.
Distinguish *why* a recognition result was suppressed. Echo/quiet-period suppression is permanent for that index; suppression merely because Ícaro was busy must still let the same index grow into “pare Ícaro”.

**Why:** Real recognizers send the interim “pare” before “pare Ícaro” on one index; permanent busy-suppression silently broke Stop during speech while final-only tests passed.

**How to apply:** Browser/gate tests for Stop, wake and questions must feed word-by-word interims followed by the final on the same index, never only complete finals.

After a normal `SpeechRecognition.onend`, wait at least 150 ms before restarting. Treat a synchronous `InvalidStateError` from `start()` as transient and retry with backoff; only permission/security errors should permanently stop listening.

**Why:** Restarting after 30 ms can race the browser's recognizer teardown. Treating that race as `not-allowed` disables the listener until the user manually resumes it.

**How to apply:** Keep automatic recognition enabled across transient end/start failures and test an injected `InvalidStateError`; still surface denied permission as blocked with clear recovery guidance.

Standby wake recognition must be on-device only. Require `processLocally = true` and an available Portuguese language pack before starting; never silently switch wake listening to a remote speech service. If local support or the pack is missing, keep the listener stopped and offer installation or a manual activation path.

**Why:** The user chose hands-free local wake detection to avoid sending ambient audio or transcripts to a speech-recognition service, while accepting that the device microphone must remain active locally to hear the wake phrase.

**How to apply:** Check local recognition support and pack availability before starting the listener, offer installation from an explicit control, and keep the post-wake one-question window at 10 seconds. Server transcription remains user-initiated.
