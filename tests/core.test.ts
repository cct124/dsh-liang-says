import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QuotePicker, splitQuote } from '../src/core/quote-picker.ts';
import { Simulation } from '../src/core/simulation.ts';
import { MIN_QUOTE_MS, MAX_QUOTE_MS, quoteDurationMs } from '../src/core/quote-timing.ts';

const quotes = [
  { id: 'a', text: '甲。', classicScore: 90 },
  { id: 'b', text: '乙。', classicScore: 30 },
  { id: 'c', text: '丙。', classicScore: 60 },
];
test('unseen quotes use classic-score proportions and never repeat the preceding quote', () => {
  const picker = new QuotePicker(quotes, () => 0);
  assert.equal(picker.weights()[0]!.probability, 0.5);
  picker.recordShown('a');
  assert.equal(picker.choose().id, 'b');
  assert.equal(picker.weights()[0]!.weight, 0);
});
test('display penalties decay on subsequent displays and recover fully', () => {
  const picker = new QuotePicker(quotes);
  picker.recordShown('a');
  picker.recordShown('b');
  assert.equal(picker.weights()[0]!.weight, 15);
  for (let i = 0; i < 5; i++) picker.recordShown(i % 2 ? 'b' : 'c');
  assert.equal(picker.weights()[0]!.penalty, 0);
  assert.equal(picker.weights()[0]!.weight, 90);
});
test('one-quote catalogs stay selectable and choosing alone consumes nothing', () => {
  const picker = new QuotePicker([quotes[0]!]);
  picker.recordShown('a');
  assert.equal(picker.choose().id, 'a');
  picker.choose();
  assert.equal(picker.weights()[0]!.penalty, 6);
});
test('durations stay within 20–45 seconds and higher scores bias the same draw longer', () => {
  for (let score = 1; score <= 100; score++) {
    for (const draw of [0, .25, .5, .75, 1]) {
      const duration = quoteDurationMs(score, () => draw);
      assert.ok(duration >= MIN_QUOTE_MS && duration <= MAX_QUOTE_MS);
      if (score <= 90) assert.ok(quoteDurationMs(score + 10, () => draw) > duration);
    }
  }
  assert.equal(quoteDurationMs(1, () => 0), MIN_QUOTE_MS);
  assert.equal(quoteDurationMs(100, () => 1), MAX_QUOTE_MS);
  assert.equal(MAX_QUOTE_MS, 45_000);
  assert.notEqual(quoteDurationMs(90, () => 0), quoteDurationMs(90, () => 1));
});

function finishEntrance(simulation: Simulation) {
  const ticket = simulation.getSnapshot().request!.ticket;
  assert.equal(simulation.commit(ticket), true);
  assert.equal(simulation.completeEntrance(ticket), true);
}

test('thinking, tools and answering each start immediately and rotate while running', () => {
  for (const phase of ['thinking', 'tool', 'answer'] as const) {
    const simulation = new Simulation(new QuotePicker(quotes, () => 0), () => .5);
    simulation.setPhase(phase);
    const first = simulation.getSnapshot().request!;
    assert.equal(first.quote.id, 'a');
    finishEntrance(simulation);
    simulation.advance(first.durationMs - 1);
    assert.equal(simulation.getSnapshot().request, first);
    simulation.advance(1);
    assert.equal(simulation.getSnapshot().request!.quote.id, 'b');
    simulation.setPhase('done');
    assert.equal(simulation.getSnapshot().request, null);
    simulation.advance(120_000);
    assert.equal(simulation.getSnapshot().request, null);
  }
});

test('phase changes preserve the quote, elapsed time and sampled duration', () => {
  let draws = 0;
  const simulation = new Simulation(new QuotePicker(quotes, () => 0), () => { draws++; return .5; });
  simulation.setPhase('thinking'); finishEntrance(simulation);
  const request = simulation.getSnapshot().request!;
  simulation.advance(6000);
  simulation.setPhase('tool'); simulation.advance(6000);
  simulation.setPhase('answer'); simulation.advance(6000);
  assert.equal(simulation.getSnapshot().request, request);
  assert.equal(simulation.getSnapshot().elapsedMs, 18_000);
  assert.equal(draws, 1);
});

test('late animation callbacks cannot reopen or penalize a dismissed quote', () => {
  const simulation = new Simulation(new QuotePicker(quotes));
  simulation.show();
  const ticket = simulation.getSnapshot().request!.ticket;
  simulation.dismiss();
  assert.equal(simulation.commit(ticket), false);
  assert.equal(simulation.completeEntrance(ticket), false);
  assert.equal(simulation.getSnapshot().shown, 0);
  assert.ok(simulation.picker.weights().every(row => row.penalty === 0));
});

test('holding time starts after entrance finishes, including with an accelerated clock', () => {
  const simulation = new Simulation(new QuotePicker(quotes));
  simulation.setPhase('tool'); simulation.setSpeed(10);
  const ticket = simulation.getSnapshot().request!.ticket;
  assert.equal(simulation.completeEntrance(ticket), false);
  assert.equal(simulation.show(), false);
  assert.equal(simulation.commit(ticket), true);
  assert.equal(simulation.commit(ticket), false);
  simulation.advance(90_000);
  assert.equal(simulation.getSnapshot().elapsedMs, 0);
  assert.equal(simulation.getSnapshot().request!.ticket, ticket);
  assert.equal(simulation.show(), false);
  assert.equal(simulation.completeEntrance(ticket), true);
  simulation.advance(1000);
  assert.equal(simulation.completeEntrance(ticket), false);
  assert.equal(simulation.getSnapshot().elapsedMs, 10_000);
  assert.equal(simulation.getSnapshot().shown, 1);
});

test('dismissal waits the full sampled duration even across running phase changes', () => {
  const simulation = new Simulation(new QuotePicker(quotes, () => 0), () => .5);
  simulation.setPhase('thinking'); finishEntrance(simulation);
  const duration = simulation.getSnapshot().durationMs;
  simulation.advance(5000); simulation.dismiss(); simulation.setPhase('tool');
  simulation.advance(duration - 1);
  assert.equal(simulation.getSnapshot().request, null);
  simulation.setPhase('answer'); simulation.advance(1);
  assert.equal(simulation.getSnapshot().request!.quote.id, 'b');
});

test('background and disabled switch pause display; finishing invalidates callbacks', () => {
  const simulation = new Simulation(new QuotePicker(quotes));
  simulation.setPhase('tool'); finishEntrance(simulation); simulation.advance(1000);
  simulation.setVisible(false); simulation.advance(90_000);
  assert.equal(simulation.getSnapshot().elapsedMs, 1000);
  assert.equal(simulation.getSnapshot().request, null);
  simulation.setVisible(true); simulation.setEnabled(false); simulation.advance(90_000);
  assert.equal(simulation.show(), false);
  assert.equal(simulation.getSnapshot().elapsedMs, 0);
  simulation.setEnabled(true);
  const ticket = simulation.getSnapshot().request!.ticket;
  simulation.setPhase('done');
  assert.equal(simulation.commit(ticket), false);
  assert.equal(simulation.completeEntrance(ticket), false);
});

test('every display samples once and reset rejects old animation callbacks', () => {
  let draw = 0;
  const simulation = new Simulation(new QuotePicker(quotes), () => { draw += .25; return draw; });
  simulation.show('a'); finishEntrance(simulation);
  const first = simulation.getSnapshot().request!;
  simulation.show('a'); finishEntrance(simulation);
  assert.ok(simulation.getSnapshot().durationMs > first.durationMs);
  const second = simulation.getSnapshot().request!;
  simulation.reset(); simulation.show('a');
  assert.equal(simulation.completeEntrance(second.ticket), false);
  assert.equal(simulation.commit(second.ticket), false);
  assert.ok(simulation.getSnapshot().request!.ticket > second.ticket);
});

test('mixed fragments preserve punctuation and Latin words', () => {
  const text = '我们的 AI 模型在 2026 年继续进步，开放创新。';
  const fragments = splitQuote(text);
  assert.equal(fragments.join(''), text);
  assert.ok(fragments.some(part => part.trim().length === 1));
  assert.ok(fragments.some(part => part.includes('AI')));
  assert.ok(fragments.some(part => part.includes('2026')));
  assert.ok(fragments.some(part => part.trim().length > 1));
  assert.ok(fragments.every(part => !/^[，。！？；：、]/u.test(part)));
});

test('the shipped catalog has three fields and each entry has traceable editorial provenance', () => {
  const catalog = JSON.parse(readFileSync(new URL('../asset/quotes/quotes.json', import.meta.url), 'utf8'));
  const source = readFileSync(new URL('../asset/quotes/liang-wenfeng-public-statements.md', import.meta.url), 'utf8');
  const provenance = JSON.parse(readFileSync(new URL('../asset/quotes/quote-sources.json', import.meta.url), 'utf8'));
  const review = JSON.parse(readFileSync(new URL('../asset/quotes/editorial-review.json', import.meta.url), 'utf8'));
  const picker = new QuotePicker(catalog);
  assert.equal(picker.quotes.length, provenance.review.currentCount);
  for (const quote of picker.quotes) {
    assert.deepEqual(Object.keys(quote).sort(), ['classicScore', 'id', 'text']);
    const editorial = provenance.review.entries[quote.id];
    assert.ok(editorial && provenance.entries[quote.id]?.length);
    if (editorial.kind === 'excerpt') assert.ok(source.replaceAll('**', '').includes(quote.text));
    else if (editorial.kind === 'combined-excerpt') {
      const originals = provenance.entries[quote.id].map((location: { line: number }) =>
        source.split(/\r?\n/)[location.line - 1]!.match(/^> “(.+)”\s*$/)![1]!.replaceAll('**', ''));
      assert.equal(quote.text, originals.join('……'));
    } else if (editorial.kind === 'edited-excerpt') {
      assert.ok(review.revisions.some((revision: { text?: string }) => revision.text === quote.text));
    } else if (editorial.kind === 'user-excerpt') {
      assert.ok(review.userQuotes.some((entry: { text: string; classicScore: number }) =>
        entry.text === quote.text && entry.classicScore === quote.classicScore));
    } else {
      assert.equal(editorial.kind, 'summary');
      assert.ok(review.supplements.some((summary: { text: string }) => summary.text === quote.text));
    }
    assert.equal(splitQuote(quote.text).join(''), quote.text);
    assert.ok(splitQuote(quote.text).length < 80);
  }
});
