/** Resolve study shortcuts from current UI state, without changing card data. */
export function studyKeyboardAction(event, { open = false, blocked = false, canInteract = false } = {}) {
  if (!open || blocked || event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229) return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const target = event.target;
  if (target?.isContentEditable || target?.closest?.('input, textarea, select, [role="textbox"], [role="combobox"]')) return null;

  const key = event.key?.toLowerCase();
  if (key === 'escape') return 'close';
  if (!canInteract) return null;
  if (key === 'n') return 'missed';
  if (key === 'm') return 'known';

  // Study owns Space and arrows even when a control retains focus after a
  // click. The caller prevents native button activation before dispatching.
  if (key === ' ') return 'flip';
  if (key === 'arrowleft') return 'previous';
  if (key === 'arrowright') return 'next';
  return null;
}
