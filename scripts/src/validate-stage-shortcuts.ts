import assert from 'node:assert/strict';
import { shouldActivateStageShortcut, type ShortcutEvent } from '../../artifacts/icaro/src/lib/stage-shortcuts';

const base: ShortcutEvent = {
  key: 'Enter', repeat: false, ctrlKey: false, metaKey: false, altKey: false,
  shiftKey: false, defaultPrevented: false, target: null,
};
const context = { panelOpen: false, helpOpen: false };
let count = 0;
const check = (name: string, fn: () => void) => { fn(); count++; console.log(`PASSOU: ${name}`); };
check('Enter ativa no palco', () => assert.equal(shouldActivateStageShortcut(base, context), true));
check('Seta direita ativa no palco', () => assert.equal(shouldActivateStageShortcut({ ...base, key: 'ArrowRight' }, context), true));
check('PageDown do controle de slides ativa', () => assert.equal(shouldActivateStageShortcut({ ...base, key: 'PageDown' }, context), true));
check('Outras teclas não ativam', () => {
  for (const key of ['ArrowLeft', 'Escape', 'a', ' ']) assert.equal(shouldActivateStageShortcut({ ...base, key }, context), false);
});
check('Segurar tecla não gera ativações repetidas', () => assert.equal(shouldActivateStageShortcut({ ...base, repeat: true }, context), false));
check('Modificadores não ativam', () => {
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) assert.equal(shouldActivateStageShortcut({ ...base, [modifier]: true }, context), false);
});
check('Não captura teclas já tratadas ou composição de texto', () => {
  assert.equal(shouldActivateStageShortcut({ ...base, defaultPrevented: true }, context), false);
  assert.equal(shouldActivateStageShortcut({ ...base, isComposing: true }, context), false);
});
check('Enter em campos ou botões mantém o comportamento original', () => {
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A']) {
    assert.equal(shouldActivateStageShortcut({ ...base, target: { tagName } }, context), false);
  }
  assert.equal(shouldActivateStageShortcut({ ...base, key: 'ArrowRight', target: { tagName: 'BUTTON' } }, context), true);
  assert.equal(shouldActivateStageShortcut({ ...base, key: 'PageDown', target: { tagName: 'BUTTON' } }, context), true);
});
check('Elementos internos de controles e campos editáveis não ativam', () => {
  assert.equal(shouldActivateStageShortcut({ ...base, target: { isContentEditable: true } }, context), false);
  assert.equal(shouldActivateStageShortcut({ ...base, target: { closest: () => ({}) } }, context), false);
});
check('Ajuda e painel abertos impedem ativação por atalho', () => {
  assert.equal(shouldActivateStageShortcut(base, { panelOpen: true, helpOpen: false }), false);
  assert.equal(shouldActivateStageShortcut(base, { panelOpen: false, helpOpen: true }), false);
});
console.log(`\n${count}/10 validações de atalhos passaram.`);