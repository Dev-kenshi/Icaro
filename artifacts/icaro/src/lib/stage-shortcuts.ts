export type ShortcutEvent = {
  key: string; repeat: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean;
  defaultPrevented: boolean; isComposing?: boolean;
  target: EventTarget | { tagName?: string; isContentEditable?: boolean; closest?: (s: string) => unknown } | null;
};
export type ShortcutContext = { panelOpen: boolean; helpOpen: boolean };

// Arrow keys are reserved for rotating the 3D scenes; presenter remotes send PageDown.
export const SHORTCUT_KEYS = ['Enter', ' ', 'PageDown'];
const EDITABLE = 'input,textarea,select,[contenteditable="true"],[contenteditable=""],[role="tab"],dialog';

export function shouldActivateStageShortcut(e: ShortcutEvent, ctx: ShortcutContext): boolean {
  if (!SHORTCUT_KEYS.includes(e.key)) return false;
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.defaultPrevented || e.isComposing) return false;
  if (ctx.panelOpen || ctx.helpOpen) return false;
  const t = e.target as { tagName?: string; isContentEditable?: boolean; closest?: (s: string) => unknown } | null;
  if (t) {
    const tag = (t.tagName ?? '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag) || t.isContentEditable) return false;
    if (t.closest?.(EDITABLE)) return false;
    // Enter and Space keep a focused button's native action. The presenter's PageDown
    // still works after clicking the microphone, when that button retains keyboard focus.
    if ((e.key === 'Enter' || e.key === ' ') && (['button', 'a'].includes(tag) || t.closest?.('button,a,[role="button"]'))) return false;
  }
  return true;
}
