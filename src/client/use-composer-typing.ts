import * as React from 'react';
import { isComposerTyping, subscribeComposerTyping, watchTypingProtection } from './composer-activity.ts';

export function useComposerTyping(): boolean {
  const [typing, setTyping] = React.useState(isComposerTyping);
  React.useLayoutEffect(() => watchTypingProtection(isComposerTyping, subscribeComposerTyping, setTyping), []);
  return typing;
}
