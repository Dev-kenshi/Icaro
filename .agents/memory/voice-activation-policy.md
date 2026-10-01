---
name: Voice activation policy
description: Deliberate wake activation is permission for one question, not an indefinitely open conversation.
---

Each “Ok, Ícaro” authorizes one question. After receiving that question, disarm immediately and return to standby after the reply. Empty activations must expire without speaking.

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
