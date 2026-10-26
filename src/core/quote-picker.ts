export interface Quote {
  readonly id: string;
  readonly text: string;
  readonly classicScore: number;
}

/** Transient cooldowns shared by every simulated session in this client. */
export class QuotePicker {
  private readonly penalties = new Map<string, number>();
  private lastId: string | null = null;
  readonly quotes: readonly Quote[];
  private readonly random: () => number;

  constructor(quotes: readonly Quote[], random = Math.random) {
    this.quotes = quotes;
    this.random = random;
    if (!quotes.length) throw new Error('The quote catalog is empty.');
    const ids = new Set<string>();
    for (const quote of quotes) {
      if (ids.has(quote.id) || !quote.text.trim() || !Number.isInteger(quote.classicScore)
        || quote.classicScore < 1 || quote.classicScore > 100) throw new Error('Invalid quote: ' + quote.id);
      ids.add(quote.id);
    }
  }

  weights() {
    const rows = this.quotes.map(quote => {
      const penalty = this.penalties.get(quote.id) ?? 0;
      const excluded = this.quotes.length > 1 && quote.id === this.lastId;
      return { quote, penalty, weight: excluded ? 0 : quote.classicScore / (1 + penalty) };
    });
    const total = rows.reduce((sum, row) => sum + row.weight, 0);
    return rows.map(row => ({ ...row, probability: row.weight / total }));
  }

  /** Choosing has no side effects: an aborted animation does not consume a quote. */
  choose(forcedId?: string): Quote {
    if (forcedId) {
      const quote = this.quotes.find(item => item.id === forcedId);
      if (!quote) throw new Error('Unknown quote: ' + forcedId);
      return quote;
    }
    const rows = this.weights();
    let cursor = this.random();
    for (const row of rows) {
      cursor -= row.probability;
      if (cursor < 0) return row.quote;
    }
    return rows.findLast(row => row.weight > 0)!.quote;
  }

  recordShown(id: string): void {
    if (!this.quotes.some(quote => quote.id === id)) throw new Error('Unknown quote: ' + id);
    for (const [key, value] of this.penalties) {
      if (value <= 1) this.penalties.delete(key);
      else this.penalties.set(key, value - 1);
    }
    this.penalties.set(id, (this.penalties.get(id) ?? 0) + 6);
    this.lastId = id;
  }

  reset(): void { this.penalties.clear(); this.lastId = null; }
}

/** Mix individual characters with small groups; keep punctuation and Latin words intact. */
export function splitQuote(text: string): string[] {
  const chunks: string[] = [];
  const sizes = [1, 3, 2, 1, 4, 1, 2, 3];
  const tokens = text.match(/[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*|[\s\S]/gu) ?? [];
  let chunk = '';
  let count = 0;
  let group = 0;
  for (const token of tokens) {
    if (/^[\s，。！？；：、…）】”’」』,.!?;:%]+$/u.test(token)) {
      if (chunk) { chunk += token; chunks.push(chunk); chunk = ''; count = 0; group++; }
      else if (chunks.length) chunks[chunks.length - 1] += token;
      else chunk = token;
      continue;
    }
    chunk += token;
    if (++count >= sizes[group % sizes.length]!) {
      chunks.push(chunk); chunk = ''; count = 0; group++;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}
