import { createHash } from 'node:crypto';

export const quoteId = text => 'liang-' + createHash('sha256')
  .update(text.replace(/[\s\p{P}]/gu, '')).digest('hex').slice(0, 10);

/** Apply explicit editorial decisions without rewriting the supplied source document. */
export function reviewQuotes(originals, review) {
  const find = prefix => {
    const matches = originals.filter(quote => quote.text.startsWith(prefix));
    if (matches.length !== 1) throw new Error(`Editorial prefix matched ${matches.length} quotes: ${prefix}`);
    return matches[0];
  };
  const supported = new Map();
  for (const group of review.supported) for (const prefix of group.prefixes) {
    const quote = find(prefix);
    if (supported.has(quote.id)) throw new Error('Duplicate verification: ' + prefix);
    supported.set(quote.id, group.locator);
  }
  const contexts = new Map(review.contexts.map(row => [find(row.prefix).id, row.context]));
  const consumed = new Set();
  const replacements = new Map();
  const withheld = [];
  const consume = quote => {
    if (consumed.has(quote.id)) throw new Error('Overlapping editorial operation: ' + quote.text);
    consumed.add(quote.id);
  };
  const annotate = (quote, parts, edit = {}) => {
    const matched = parts.filter(part => supported.has(part.id));
    const inScope = parts.some(part => part.locations.some(location => location.section === '7.1'));
    const status = edit.locator ? 'supported' : !inScope ? 'outside-scope'
      : matched.length === parts.length ? 'supported' : matched.length ? 'partial' : 'not-covered';
    const kind = edit.text ? 'edited-excerpt' : parts.length > 1 ? 'combined-excerpt' : 'excerpt';
    const locations = parts.flatMap(part => part.locations.map(location => ({
      ...location,
      // The old section-level S10–S14 list did not prove that each article contained each quote.
      sourceIds: location.section !== '7.1' ? location.sourceIds : [
        ...location.sourceIds.filter(id => id !== review.source.id),
        ...(supported.has(part.id) || edit.locator ? [review.source.id] : []),
      ],
    })));
    const context = edit.context ?? contexts.get(quote.id) ?? locations[0].topic.replace(/^\d+(?:\.\d+)*\s+/, '');
    return {
      ...quote, locations,
      editorial: {
        kind, context, originalIds: parts.map(part => part.id), reason: edit.reason ?? null,
        verification: { status, sourceId: review.source.id,
          locators: [...new Set(edit.locator ? [edit.locator] : matched.map(part => supported.get(part.id)))] },
      },
      display: { kind, context, dateLabel: inScope ? '2026年5月' : `${locations[0].year}年` },
    };
  };
  for (const edit of review.revisions) {
    const parts = edit.prefixes.map(find);
    const duplicates = (edit.removeDuplicates ?? []).map(find);
    [...parts, ...duplicates].forEach(consume);
    // Ellipses deliberately identify a combination of supplied excerpts, not a continuous transcript.
    const text = edit.text ?? parts.map(part => part.text).join('……');
    const quote = annotate({ id: quoteId(text), text, classicScore: Math.max(...parts.map(part => part.classicScore)) }, parts, edit);
    quote.editorial.removedDuplicateIds = duplicates.map(part => part.id);
    replacements.set(parts[0].id, quote);
  }
  for (const row of review.withheld) {
    const quote = find(row.prefix);
    consume(quote);
    withheld.push({ id: quote.id, text: quote.text, reason: row.reason, locations: quote.locations });
  }
  const quotes = originals.flatMap(quote => replacements.has(quote.id) ? [replacements.get(quote.id)]
    : consumed.has(quote.id) ? [] : [annotate(quote, [quote])]);
  for (const [index, row] of review.supplements.entries()) {
    quotes.push({
      id: quoteId(row.text), text: row.text, classicScore: row.classicScore,
      locations: [{ document: 'asset/quotes/editorial-review.json', section: 'supplements', item: index,
        topic: row.context, year: 2026, reliability: 'B/C', sourceIds: [review.source.id] }],
      editorial: { kind: 'summary', context: row.context, originalIds: [],
        reason: '编辑概述，非逐字引语；展示时必须标明观点整理。',
        verification: { status: 'summary', sourceId: review.source.id, locators: [row.locator] } },
      display: { kind: 'summary', context: row.context, dateLabel: '2026年5月' },
    });
  }
  for (const [index, row] of (review.userQuotes ?? []).entries()) {
    quotes.push({
      id: quoteId(row.text), text: row.text, classicScore: row.classicScore,
      locations: [{ document: 'asset/quotes/editorial-review.json', section: 'userQuotes', item: index,
        topic: row.context, addedAt: row.addedAt, reliability: '用户提供', sourceIds: [] }],
      editorial: { kind: 'user-excerpt', context: row.context, originalIds: [],
        reason: '按用户提供的原文及经典分补充，未指定外部出处。',
        verification: { status: 'user-provided', sourceId: null, locators: [] } },
      display: { kind: 'user-excerpt', context: row.context, dateLabel: '日期未注明' },
    });
  }
  if (new Set(quotes.map(quote => quote.id)).size !== quotes.length) throw new Error('Duplicate curated quote');
  return { quotes, withheld };
}
