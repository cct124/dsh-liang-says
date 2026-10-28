import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isComposerTyping, watchTypingProtection } from '../src/client/composer-activity.ts';

function editor(text: string, editable = true, disabled = false): Element {
  return {
    textContent: text,
    getAttribute: (name: string) => name === 'aria-disabled' && disabled ? 'true' : null,
    closest(selector: string) {
      assert.equal(selector, '[data-composer-input][contenteditable="true"]');
      return editable ? this : null;
    },
  } as Element;
}

test('only a focused editable DSH composer with actual text blocks quotes', () => {
  assert.equal(isComposerTyping({ activeElement: editor('正在输入') }), true);
  assert.equal(isComposerTyping({ activeElement: editor('draft\nwith another line') }), true);
  for (const value of ['', ' \n\t', '\u00a0\u200b\ufeff']) {
    assert.equal(isComposerTyping({ activeElement: editor(value) }), false);
  }
  assert.equal(isComposerTyping({ activeElement: editor('read-only draft', false) }), false);
  assert.equal(isComposerTyping({ activeElement: editor('disabled draft', true, true) }), false);
});

test('focus handoff waits for the click; resumed typing cancels it and disposal removes pending work', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let active = false;
  let update = () => {};
  let disposed = false;
  const values: boolean[] = [];
  const stop = watchTypingProtection(() => active, listener => {
    update = listener;
    return () => { disposed = true; };
  }, value => values.push(value));
  active = true; update();
  assert.deepEqual(values, [false, true]);
  active = false; update();
  t.mock.timers.tick(200);
  assert.deepEqual(values, [false, true]);
  active = true; update();
  t.mock.timers.tick(1000);
  assert.deepEqual(values, [false, true]);
  active = false; update();
  t.mock.timers.tick(250);
  assert.deepEqual(values, [false, true, false]);
  active = true; update();
  active = false; update();
  stop();
  t.mock.timers.tick(1000);
  assert.equal(disposed, true);
  assert.deepEqual(values, [false, true, false, true]);
});

test('a blurred draft and unrelated search fields do not pause quotes', () => {
  assert.equal(isComposerTyping({ activeElement: null }), false);
  const unrelated = editor('search text', false);
  assert.equal(isComposerTyping({ activeElement: unrelated }), false);
  const draft = editor('restored draft');
  const child = editor('');
  child.closest = (() => draft) as Element['closest'];
  assert.equal(isComposerTyping({ activeElement: child }), true);
});
