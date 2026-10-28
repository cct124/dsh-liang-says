import * as React from 'react';
import quotes from '../../asset/quotes/quotes.json';
import sourceData from '../../asset/quotes/quote-sources.json';
import { QuotePicker } from '../core/quote-picker.ts';
import { quotePresentation } from '../core/quote-presentation.ts';
import { Simulation, isTaskRunning, type Phase } from '../core/simulation.ts';
import { QuoteOverlay } from './overlay.tsx';
import { zh, en, type Translate } from './locales.ts';
import type { DshClientContext } from './dsh-contract.ts';
import css from './style.css';
import artworkCss from './artwork.css';
import { installLiang } from './live.tsx';
import { LiangToggle } from './toggle.tsx';
import type { LiangPreference } from '../core/preference.ts';

const NS = 'liang.preview';
const PANEL = 'liang-preview';
type Source = { year: number; reliability: string; sourceIds: string[]; line?: number };
const sources: Record<string, Source[]> = sourceData.entries;
const reviewEntries: Record<string, { verification: { status: string; locators: string[] } }> = sourceData.review.entries;

export const inject = ['slots', 'locale'];
export function apply(ctx: DshClientContext): void {
  const preference = installLiang(ctx);
  const simulation = new Simulation(new QuotePicker(quotes));
  simulation.setEnabled(preference.getSnapshot());
  ctx.effect(() => preference.subscribe(() => simulation.setEnabled(preference.getSnapshot())), 'liang: preview preference');
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'liang: preview translations');
  const t = ctx.locale.bind(NS);
  function Page({ t }: { t: Translate }) { return <Preview simulation={simulation} preference={preference} t={t} />; }
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL, locale: NS }, Page));
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: PANEL, order: 20, label: () => t('panel'), locale: NS,
  }, SunIcon));
  ctx.effect(() => () => { simulation.setVisible(false); simulation.setPhase('idle'); }, 'liang: stop simulation');
}

function SunIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 1v3m0 16v3M1 12h3m16 0h3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M19.8 4.2l-2.1 2.1M6.3 17.7l-2.1 2.1" />
  </svg>;
}

function Preview({ simulation, preference, t }: { simulation: Simulation; preference: LiangPreference; t: Translate }) {
  const state = React.useSyncExternalStore(simulation.subscribe, simulation.getSnapshot);
  const [library, setLibrary] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [sample, setSample] = React.useState('random');
  const [reduced, setReduced] = React.useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [error, setError] = React.useState('');
  const commit = React.useCallback((ticket: number) => simulation.commit(ticket), [simulation]);
  const onEntered = React.useCallback((ticket: number) => { simulation.completeEntrance(ticket); }, [simulation]);
  const dismiss = React.useCallback(() => simulation.dismiss(), [simulation]);
  const onError = React.useCallback((message: string) => setError(message), []);

  React.useEffect(() => {
    let previous = performance.now();
    const visibility = () => { previous = performance.now(); simulation.setVisible(!document.hidden); };
    visibility();
    const timer = setInterval(() => {
      const now = performance.now();
      if (!document.hidden) simulation.advance(now - previous);
      previous = now;
    }, 100);
    document.addEventListener('visibilitychange', visibility);
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => setReduced(media.matches);
    media.addEventListener('change', motion);
    return () => {
      clearInterval(timer); document.removeEventListener('visibilitychange', visibility);
      media.removeEventListener('change', motion); simulation.setVisible(false); simulation.setPhase('idle');
    };
  }, [simulation]);

  const show = () => {
    setError('');
    const sorted = [...quotes].sort((a, b) => a.text.length - b.text.length);
    simulation.show(sample === 'shortest' ? sorted[0]!.id : sample === 'longest' ? sorted.at(-1)!.id : undefined);
  };
  const current = state.request?.quote;
  const source = current ? sources[current.id]?.[0] : undefined;
  const rows = React.useMemo(() => simulation.picker.weights().filter(row => row.quote.text.includes(search))
    .sort((a, b) => b.quote.classicScore - a.quote.classicScore), [simulation, state.shown, search]);
  const countdown = Math.ceil((state.durationMs - state.elapsedMs) / 1000);
  const active = isTaskRunning(state.phase) && state.enabled && state.visible;

  return <section className="lx-page" aria-label={t('panel')}>
    <style>{artworkCss + css}</style>
    <div className="lx-stage">
      <header className="lx-page-heading"><div className="lx-brand"><SunIcon size={23} /><strong>{t('title')}</strong><span>{t('subtitle')}</span></div>
        <span className="lx-preview-note">{t('description')}</span></header>
      <div className="lx-welcome">
        <div className="lx-orbit" aria-hidden="true"><SunIcon size={40} /></div>
        <span className="lx-eyebrow">LIANG SAYS</span>
        <h1>{t('lead')}</h1><p>{t('intro')}</p>
        <div className="lx-live-state"><i className={active ? 'lx-pulse' : ''} />{t(state.phase)}</div>
        <p className="lx-state-hint">{!state.enabled ? t('disabledHint') : t((state.phase + 'Hint') as 'idleHint')}</p>
      </div>
      <div className="lx-stage-footer"><span>{quotes.length} {t('items')} · 2019—2026</span><span>{t('shown')} {state.shown} {t('items')}</span></div>
      {state.enabled && <QuoteOverlay request={state.request} commit={commit} onEntered={onEntered} dismiss={dismiss} reducedMotion={reduced} closeLabel={t('close')} onError={onError} />}
    </div>
    <div className="lx-console">
      <div className="lx-console-top"><div className="lx-console-title"><span className="lx-dev-tag">DEV</span><span>{t('state')}</span></div>
        <div className="lx-console-tools"><button type="button" className={library ? 'is-selected' : ''} onClick={() => setLibrary(!library)} aria-expanded={library}>{t(library ? 'closeCatalog' : 'catalog')} <span>{quotes.length}</span></button>
          <button type="button" onClick={() => { simulation.reset(); simulation.setEnabled(preference.getSnapshot()); setError(''); }}>{t('reset')}</button></div></div>
      <div className="lx-controls">
        <div className="lx-phases" aria-label={t('state')}>
          {(['thinking', 'tool', 'answer', 'done'] as Phase[]).map(phase => <button type="button" key={phase} aria-pressed={state.phase === phase}
            onClick={() => simulation.setPhase(phase)}>{phase === 'thinking' ? t(state.phase === 'idle' || state.phase === 'done' ? 'start' : 'thinking') : t(phase)}</button>)}
        </div>
        <div className="lx-settings">
          <LiangToggle preference={preference} label={t('liang')} hint={t('toggleHint')} />
          <div className="lx-duration-setting"><span>{t('duration')}</span><output title={t('durationHint')}>{t('durationRange')}</output></div>
          <label>{t('speed')}<select value={state.speed} onChange={event => simulation.setSpeed(Number(event.target.value))}>{[1, 5, 10].map(value => <option key={value} value={value}>{value}×</option>)}</select></label>
          <label>{t('sample')}<select value={sample} onChange={event => setSample(event.target.value)}>{['random', 'shortest', 'longest'].map(value => <option key={value} value={value}>{t(value as 'random')}</option>)}</select></label>
        </div>
        <button type="button" className="lx-show" disabled={!state.enabled || state.pending} onClick={show}><SunIcon size={17} />{t(state.pending ? 'transitioning' : current ? 'next' : 'show')}</button>
      </div>
      <div className="lx-timing"><span>{t('countdown')} <strong>{state.pending ? t('gathering') : active ? String(countdown).padStart(2, '0') + 's' : t('paused')}</strong></span>
        <div className="lx-track"><div style={{ width: (state.elapsedMs / state.durationMs * 100) + '%' }} /></div>
        <label className="lx-motion"><input type="checkbox" checked={reduced} onChange={event => setReduced(event.target.checked)} />{t('reduced')}</label>
      </div>
      {current && <div className="lx-quote-info"><span>{t('selected')}: {current.id}</span><span>{t('score')} {current.classicScore}</span>
        <span>{t('hold')}: {state.durationMs / 1000} {t('seconds')}</span>
        <span>{t('source')} {source?.year} · {source?.sourceIds.join('/')} · {source?.reliability}{source?.reliability === 'B/C' ? ' · ' + t('excerpt') : ''}</span>
        <span>{quotePresentation(current.id).label}</span>
        <span>{t('review')}: {t((reviewEntries[current.id]?.verification.status ?? 'outside-scope') as 'supported')}</span>
        {reviewEntries[current.id]?.verification.locators.length > 0 && <a href={sourceData.review.source.url} target="_blank" rel="noreferrer">{t('reviewSource')}</a>}</div>}
      {error && <p role="alert" className="lx-error">{t('error')}: {error}</p>}
      {library && <div className="lx-library"><input className="lx-search" type="search" placeholder={t('search')} aria-label={t('search')} value={search} onChange={event => setSearch(event.target.value)} />
        <div className="lx-table-scroll"><table><thead><tr><th>{t('catalog')}</th><th>{t('score')}</th><th>{t('penalty')}</th><th>{t('chance')}</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.quote.id}><td><button type="button" disabled={state.pending || !state.enabled} onClick={() => simulation.show(row.quote.id)}>{row.quote.text}</button><small className="lx-library-context">{quotePresentation(row.quote.id).caption}</small></td><td>{row.quote.classicScore}</td><td>{row.penalty}</td><td>{(row.probability * 100).toFixed(2)}%</td></tr>)}</tbody></table>{!rows.length && <p>{t('empty')}</p>}</div>
      </div>}
    </div>
  </section>;
}
