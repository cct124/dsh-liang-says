import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const sourcePath = 'asset/quotes/liang-wenfeng-public-statements.md';
const source = await readFile(new URL(sourcePath, root), 'utf8');
const sections = {
  '3.1': { year: 2019, level: 'A/B', sources: ['S1'], score: 55 },
  '3.2': { year: 2019, level: 'B', sources: ['S2'], score: 50 },
  '3.3': { year: 2021, level: 'A/B', sources: ['S3'], score: 55 },
  '4.1': { year: 2023, level: 'A', sources: ['S4'], score: 70 },
  '5.1': { year: 2024, level: 'A', sources: ['S5'], score: 70 },
  '7.1': { year: 2026, level: 'B/C', sources: ['S10', 'S11', 'S12', 'S13', 'S14'], score: 60 },
};

// Editorial weights describe memorability, not the reliability of the statement.
const highlights = [
  ['我们看到的是中国 AI 不可能永远处在跟随的位置', 100],
  ['创新往往都是自己产生的', 98],
  ['一件激动人心的事，或许不能单纯用钱衡量', 98],
  ['你越克制，越有可能做成 AGI', 98],
  ['我们不是有意成为一条鲶鱼', 95],
  ['在颠覆性的技术面前', 95],
  ['不是所有人都能疯狂一辈子', 96],
  ['AI 现在不缺品位和直觉', 94],
  ['我们最大的核心利益是要保持团队的稳定性', 94],
  ['我们跟美国的差距主要在资源上面', 90],
  ['作为对冲基金，我们的使命是', 86],
  ['对我来讲，克制是一种战略', 92],
  ['创新需要尽可能少的干预和管理', 92],
  ['我们创新缺的肯定不是资本', 92],
  ['过去三十年，我们都只强调赚钱', 92],
  ['我们认为随着经济发展', 88],
  ['热爱，扎实的基础能力', 92],
  ['因为我们在做最难的事', 94],
  ['我觉得创新首先是一个信念问题', 92],
  ['很多人对做研究的渴望', 90],
  ['我们选人的标准一直都是热爱和好奇心', 90],
  ['开源更像一个文化行为', 90],
  ['更多的投入并不一定产生更多的创新', 88],
  ['所有的套路都是上一代的产物', 88],
  ['技术没有秘密，但重置需要时间和成本', 86],
  ['真正的决定力量往往不是一些现成的规则和条件', 90],
  ['创新就是昂贵且低效的', 88],
  ['信仰者会之前就在这里', 85],
  ['不一定是做过这件事的人才能做这件事', 90],
  ['如果追求短期目标，找现成有经验的人是对的', 88],
  ['交给他重要的事，并且不干预他', 86],
  ['我们把价值沉淀在团队上', 88],
  ['我们不会闭源', 88],
  ['对研究员来说，对算力的渴求是永无止境的', 83],
  ['我们是怀着一个对这个世界非常大的善意', 92],
  ['管理一个大公司，靠的不是你的规章制度', 92],
  ['我们没有什么本事', 85],
  ['如果我们想独占', 90],
  ['我们把价格又降下来了', 78],
  ['我觉得这个才是我们真实的想法', 85],
  ['拿得多的人会被拿得少的人打败', 90],
  ['为什么我们这么坚持开源', 86],
  ['下一代模型的核心能力', 82],
  ['其实学习可能不是一项技术', 84],
  ['人才不是瓶颈，资源是最大的瓶颈', 86],
  ['我们训练这么大的模型', 88],
  ['只要我能够保持团队的稳定性', 85],
  ['我们一般也不太加班', 85],
  ['我在公司内的权威是建立在共识的基础上的', 86],
  ['我们是很愿意协助、帮助任何人', 85],
  ['数据应该几乎就等于模型的一半', 86],
  ['我们希望只做一块', 86],
  ['我们会不会向上游进行垂直整合', 84],
  ['我们每个人对于卡和人的调动是不设上限的', 84],
  ['当很多人发现过去赚快钱', 87],
  ['最开始的几十个人完全没有这么想过', 35],
  ['这个愿景甚至也不是成文的', 40],
  ['它其实不是利润最大化的', 40],
  ['持续学习之后，可能我们就会来到一个奇点', 50],
  ['这个奇点，它并不是一个奇点', 40],
  ['从团队稳定性来讲', 40],
  ['随着人员的增加', 35],
  ['我们没有那么多精力', 35],
  ['可能是 2 年、5 年或者 10 年', 35],
  ['外部看到的是幻方 2015 年后的部分', 40],
  ['如果单纯只做量化投资', 40],
  ['其实我们的量化基金已经基本不怎么对外募集了', 35],
];

let section = '';
let topic = '';
const entries = new Map();
const usedHighlights = new Set();
for (const [index, line] of source.split(/\r?\n/).entries()) {
  const heading = line.match(/^### (\d+\.\d+)\s+(.+)$/);
  if (heading) { section = heading[1]; topic = heading[2]; }
  else if (line.startsWith('## ')) section = '';
  else if (line.startsWith('#### ')) topic = line.slice(5);
  const match = line.match(/^> “(.+)”\s*$/);
  if (!sections[section] || !match) continue;
  const text = match[1].replaceAll('**', '').trim();
  const normalized = text.replace(/[\s\p{P}]/gu, '');
  const id = 'liang-' + createHash('sha256').update(normalized).digest('hex').slice(0, 10);
  const highlight = highlights.find(([prefix]) => text.startsWith(prefix));
  if (highlight) usedHighlights.add(highlight[0]);
  const info = sections[section];
  const occurrence = { line: index + 1, section, topic, year: info.year, reliability: info.level, sourceIds: info.sources };
  if (entries.has(id)) {
    entries.get(id).locations.push(occurrence);
    continue;
  }
  entries.set(id, { id, text, classicScore: highlight?.[1] ?? info.score, locations: [occurrence] });
}
const unused = highlights.filter(([prefix]) => !usedHighlights.has(prefix));
if (unused.length) throw new Error('Unmatched editorial prefixes: ' + unused.map(([prefix]) => prefix).join(', '));
const all = [...entries.values()];
const quotes = all.map(({ id, text, classicScore }) => ({ id, text, classicScore }));
const sources = {
  sourceDocument: sourcePath,
  note: '按用户提供的汇编原文结构化，未独立核验外部出处。可靠性标签沿用原文；B/C 条目为流出实录整理。经典分是编辑权重，不是可靠性评分。',
  excluded: ['核心十句与主题索引重复内容', '2025 年会议、采访等事实记述', '2026 年 9 月匿名消息源的媒体概括', '编者说明与误传示例'],
  entries: Object.fromEntries(all.map(({ id, locations }) => [id, locations])),
};
const output = [['asset/quotes/quotes.json', quotes], ['asset/quotes/quote-sources.json', sources]];
for (const [filename, value] of output) {
  const content = JSON.stringify(value, null, 2) + '\n';
  const url = new URL(filename, root);
  if (process.argv.includes('--check')) {
    if (await readFile(url, 'utf8') !== content) throw new Error('Outdated: ' + filename);
  } else await writeFile(url, content);
}
console.log(`${quotes.length} unique quotes; ${Math.min(...quotes.map(q => q.text.length))}–${Math.max(...quotes.map(q => q.text.length))} characters. ${process.argv.includes('--check') ? 'Verified' : 'Written'} ${fileURLToPath(new URL('asset/quotes/quotes.json', root))}`);
