import * as React from 'react';
import quotes from '../../asset/quotes/quotes.json';
import { QuotePicker } from '../core/quote-picker.ts';
import { Simulation } from '../core/simulation.ts';
import { LiangPreference } from '../core/preference.ts';
import { LiveQuotes } from '../core/live-quotes.ts';
import type { DshClientContext, ShellProps } from './dsh-contract.ts';
import { QuoteOverlay } from './overlay.tsx';
import { LiangToggle } from './toggle.tsx';
import { isComposerTyping } from './composer-activity.ts';
import { useComposerTyping } from './use-composer-typing.ts';
import artworkCss from './artwork.css';
import liveCss from './live.css';

const NS = 'liang';
export function installLiang(ctx: DshClientContext): LiangPreference {
  let storage: Storage | undefined;
  try { storage = window.localStorage; } catch { /* Private browser profiles can deny storage. */ }
  const preference = new LiangPreference(storage);
  const picker = new QuotePicker(quotes);
  ctx.effect(() => ctx.locale.register(NS, {
    zh: { label: '梁选', hint: '在所有模式的任务运行期间展示梁选文案', close: '点击任意位置收起' },
    en: { label: 'Liang', hint: 'Show Liang quotes while tasks run in any mode', close: 'Click anywhere to dismiss' },
  }), 'liang: translations');
  ctx.effect(() => {
    const update = (event: StorageEvent) => preference.receiveStorage(event.key, event.newValue);
    window.addEventListener('storage', update);
    return () => window.removeEventListener('storage', update);
  }, 'liang: sync preference');
  function Toggle({ t }: { t: (key: string) => string }) {
    return <LiangToggle preference={preference} label={t('label')} hint={t('hint')} />;
  }
  function Overlay(props: ShellProps) { return <LiveOverlay {...props} picker={picker} preference={preference} />; }
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left', id: 'liang-toggle', order: 0, locale: NS,
  }, Toggle));
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'liang-overlay', order: 10, locale: NS,
  }, Overlay));
  return preference;
}

function LiveOverlay({ preference, picker, useSessions, useSessionStatus, usePanelInfo, t }: ShellProps & {
  preference: LiangPreference; picker: QuotePicker;
}) {
  const sessionId = useSessions(state => Object.keys(state.byId).find(id => (state.byId[id]?.retainedBy.mainView ?? 0) > 0));
  const running = useSessionStatus(state => sessionId !== undefined && state.get(sessionId)?.running === true);
  const waitingForUser = useSessionStatus(state => sessionId !== undefined && state.get(sessionId)?.pendingInteraction !== undefined);
  const inConversation = usePanelInfo(state => state.activePanelId === null);
  const enabled = React.useSyncExternalStore(preference.subscribe, preference.getSnapshot);
  const userTyping = useComposerTyping();
  const [visible, setVisible] = React.useState(!document.hidden);
  const [reduced, setReduced] = React.useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const live = React.useMemo(() => new LiveQuotes(new Simulation(picker, Math.random, () => !isComposerTyping())), [picker]);
  const simulation = live.simulation;
  const state = React.useSyncExternalStore(simulation.subscribe, simulation.getSnapshot);
  const [error, setError] = React.useState('');
  React.useLayoutEffect(() => {
    live.sync({ sessionId, running, enabled, visible: visible && inConversation, waitingForUser, userTyping });
  }, [live, sessionId, running, enabled, visible, inConversation, waitingForUser, userTyping]);
  React.useEffect(() => {
    let previous = performance.now();
    const visibility = () => { previous = performance.now(); setVisible(!document.hidden); };
    const timer = setInterval(() => {
      const now = performance.now();
      if (!document.hidden) simulation.advance(now - previous);
      previous = now;
    }, 100);
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => setReduced(media.matches);
    document.addEventListener('visibilitychange', visibility);
    media.addEventListener('change', motion);
    return () => {
      clearInterval(timer); document.removeEventListener('visibilitychange', visibility);
      media.removeEventListener('change', motion); simulation.setVisible(false); simulation.setPhase('idle');
    };
  }, [simulation]);
  const commit = React.useCallback((ticket: number) => simulation.commit(ticket), [simulation]);
  const onEntered = React.useCallback((ticket: number) => { simulation.completeEntrance(ticket); }, [simulation]);
  const dismiss = React.useCallback(() => simulation.dismiss(), [simulation]);
  const onError = React.useCallback((message: string) => setError(message), []);
  // Unmount immediately so neither an old frame nor its sound interrupts editing or host controls.
  if (!enabled || !visible || !inConversation || waitingForUser || userTyping || !sessionId) return null;
  return <div className="lx-live-stage" key={sessionId}>
    <style>{artworkCss + liveCss}</style>
    <QuoteOverlay request={state.request} commit={commit} onEntered={onEntered} dismiss={dismiss}
      reducedMotion={reduced} closeLabel={t('close')} onError={onError} />
    {error && <button className="lx-live-error" onClick={() => setError('')} role="alert">{error}</button>}
  </div>;
}
