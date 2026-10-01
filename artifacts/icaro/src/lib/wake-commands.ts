/** Wake words are processed before ordinary text can reach the assistant. */
export function parseWakeCommand(text: string, active: boolean) {
  text = text.normalize('NFC');
  const stop = /\b(?:stop|estope|pare)[\s,.!?;:—-]+[íi]caro\b/i.exec(text);
  if (stop) return { stop: true, wake: false, question: '' };
  // Mentioning the wake phrase in a conversation is not addressing the assistant.
  const wake = /^\s*(?:o[.\s]*k\.?|okay|okey|okei|oquei)[\s,.!?;:—-]+[íi]caro\b/i.exec(text);
  const question = wake
    ? text.slice(wake.index + wake[0].length).replace(/^[\s,.!?;:—-]+/, '').trim()
    : active ? text.trim() : '';
  return { stop: false, wake: !!wake, question };
}