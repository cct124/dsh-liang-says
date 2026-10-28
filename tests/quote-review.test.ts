import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { quotePresentation } from '../src/core/quote-presentation.ts';

const read = (name: string) => JSON.parse(readFileSync(new URL(`../asset/quotes/${name}.json`, import.meta.url), 'utf8'));
const catalog: { id: string; text: string; classicScore: number }[] = read('quotes');
const sources = read('quote-sources');
const contexts = read('quote-context');

test('every original item is retained, incorporated, explicitly corrected, deduplicated or withheld exactly once', () => {
  const originalIds: string[] = Object.values(sources.review.entries).flatMap((entry: any) =>
    [...entry.originalIds, ...(entry.removedDuplicateIds ?? [])]);
  originalIds.push(...sources.review.withheld.map((entry: any) => entry.id));
  assert.equal(originalIds.length, 212);
  assert.equal(new Set(originalIds).size, 212);
  assert.equal(catalog.length, 189);
  assert.equal(sources.review.withheld.length, 2);
  for (const quote of catalog) {
    const id = 'liang-' + createHash('sha256').update(quote.text.replace(/[\s\p{P}]/gu, '')).digest('hex').slice(0, 10);
    assert.equal(quote.id, id);
  }
});

test('signatures stay minimal while library metadata preserves editorial attribution', () => {
  assert.deepEqual(Object.keys(contexts).sort(), catalog.map(quote => quote.id).sort());
  const summaries = catalog.filter(quote => sources.review.entries[quote.id].kind === 'summary');
  assert.equal(summaries.length, 8);
  for (const quote of catalog) {
    const presentation = quotePresentation(quote.id);
    assert.equal(presentation.signature, '——梁文锋');
    assert.ok(presentation.caption);
    if (summaries.includes(quote)) {
      assert.match(presentation.label, /观点整理/);
      assert.match(presentation.caption, /非逐字引语/);
    }
    if (sources.entries[quote.id].some((location: any) => location.year === 2026)) {
      assert.match(presentation.caption, /2026年5月/);
      assert.doesNotMatch(presentation.caption, /20日/);
    }
  }
});

test('S13 is not assigned to unverified content merely because it is from the same meeting', () => {
  for (const quote of catalog) {
    const verification = sources.review.entries[quote.id].verification;
    const hasS13 = sources.entries[quote.id].some((location: any) => location.sourceIds.includes('S13'));
    assert.equal(hasS13, ['supported', 'partial', 'summary'].includes(verification.status));
    assert.equal(verification.locators.length > 0, hasS13);
  }
  assert.equal(sources.review.source.eventDate, '2026-05');
  assert.equal(sources.review.source.publishedAt, '2026-07-23');
});

test('context-sensitive conclusions keep their qualification and detached fragments leave rotation', () => {
  const demand = catalog.find(quote => quote.text.includes('To B 业务的上限'))!;
  assert.match(demand.text, /^在当前技术的条件下/);
  const price = catalog.find(quote => quote.text.startsWith('我们的 API 定价'))!;
  assert.match(price.text, /十个月收回成本/);
  assert.match(price.text, /在这个价格区间/);
  const catchup = catalog.find(quote => quote.text.startsWith('我们跟美国的差距可能'))!;
  assert.match(catchup.text, /未来我们要把这个叙事改写/);
  assert.match(quotePresentation(catchup.id).caption, /非已实现成果/);
  assert.ok(!catalog.some(quote => /^它其实不是利润最大化的|^未来我们要把这个叙事改写|^成本控制得好的人|^四张华为卡|^我觉得在这一点上，英伟达|^Anthropic 现在超过/.test(quote.text)));
});
