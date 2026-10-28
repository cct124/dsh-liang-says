/** DSH's Lexical editor marks its editable root with data-composer-input. */
export function isComposerTyping(doc: Pick<Document, 'activeElement'> = document): boolean {
  const editor = doc.activeElement?.closest('[data-composer-input][contenteditable="true"]');
  return !!editor && editor.getAttribute('aria-disabled') !== 'true'
    && (editor.textContent ?? '').replace(/[\u200B\uFEFF]/gu, '').trim().length > 0;
}

/** Observe typing, focus, IME edits and programmatic draft restoration/clearing. */
export function subscribeComposerTyping(listener: () => void): () => void {
  let disposed = false;
  const update = () => { if (!disposed) listener(); };
  // focusout can run before activeElement points to the next control.
  const focusOut = () => queueMicrotask(update);
  const events = ['focusin', 'input', 'compositionstart', 'compositionupdate', 'compositionend'];
  for (const event of events) document.addEventListener(event, update, true);
  document.addEventListener('focusout', focusOut, true);
  const observer = new MutationObserver(update);
  observer.observe(document.body, {
    subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ['contenteditable', 'aria-disabled'],
  });
  return () => {
    disposed = true;
    observer.disconnect();
    for (const event of events) document.removeEventListener(event, update, true);
    document.removeEventListener('focusout', focusOut, true);
  };
}

/** Resume after the click that moved focus finishes, rather than covering its target at pointerdown. */
export function watchTypingProtection(read: () => boolean, subscribe: (listener: () => void) => () => void,
  onChange: (typing: boolean) => void): () => void {
  let typing = read();
  let resume: ReturnType<typeof setTimeout> | undefined;
  const publish = (value: boolean) => { typing = value; onChange(value); };
  const update = () => {
    if (read()) {
      clearTimeout(resume); resume = undefined;
      if (!typing) publish(true);
    } else if (typing && resume === undefined) {
      resume = setTimeout(() => { resume = undefined; publish(read()); }, 250);
    }
  };
  onChange(typing);
  const dispose = subscribe(update);
  update();
  return () => { dispose(); clearTimeout(resume); };
}
