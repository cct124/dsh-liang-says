import contextData from '../../asset/quotes/quote-context.json' with { type: 'json' };

type QuoteContext = { kind: string; context: string; dateLabel: string };
const contexts: Record<string, QuoteContext> = contextData;

export function quotePresentation(id: string) {
  const context = contexts[id];
  const kind = context?.kind ?? 'excerpt';
  const label = kind === 'summary' ? '观点整理，非逐字引语'
    : kind === 'combined-excerpt' ? '节选合并'
    : kind === 'edited-excerpt' ? '校订节选'
    : kind === 'user-excerpt' ? '用户补充节选' : '原汇编节选';
  return {
    kind, label,
    signature: '——梁文锋',
    caption: context ? `${context.dateLabel} · ${context.context} · ${label}` : '',
  };
}
