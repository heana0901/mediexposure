import { isProvider, type Provider } from "./providers";
import { citesDomain, clientNameVariants, nameKey, sourceHost } from "./nameMatch";
import type {
  CompetitorFrequencyEntry,
  ExposureTally,
  ProviderCounts,
  SelfExposure,
  SourceFrequencyEntry,
  VisibilityMetrics,
} from "./types";

/**
 * 모니터링 결과 집계.
 *
 * 한 질문을 같은 AI에 여러 번(샘플) 물으면 샘플마다 행이 하나씩 쌓인다.
 * 그래서 "노출 행 수 / 전체 행 수"가 곧 노출 확률이 되고, 아래 함수들은
 * 샘플이 1개인 과거 데이터와 여러 개인 새 데이터를 같은 방식으로 다룬다.
 */
type ResultRow = {
  provider: string;
  mentioned: boolean;
  rank?: number | null;
  competitors?: string[] | null;
  sources?: { url: string; title?: string | null }[] | null;
};

function bump(counts: ProviderCounts, provider: Provider) {
  counts[provider] = (counts[provider] ?? 0) + 1;
}

function sumCounts(counts: ProviderCounts): number {
  return Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
}

export function rate(rows: { mentioned: boolean }[]): number | null {
  return rows.length === 0 ? null : Math.round((rows.filter((r) => r.mentioned).length / rows.length) * 100);
}

export function ratesByProvider(rows: ResultRow[]): Partial<Record<Provider, number>> {
  const grouped = new Map<Provider, ResultRow[]>();
  for (const r of rows) {
    if (!isProvider(r.provider)) continue;
    const list = grouped.get(r.provider) ?? [];
    list.push(r);
    grouped.set(r.provider, list);
  }

  const rates: Partial<Record<Provider, number>> = {};
  for (const [provider, list] of grouped) {
    const value = rate(list);
    if (value !== null) rates[provider] = value;
  }
  return rates;
}

/**
 * 경쟁 병원 언급 횟수. "서울이비인후과의원"과 "서울이비인후과"처럼 표기만 다른 이름은
 * 한 병원으로 합치고, 가장 많이 쓰인 표기를 대표 이름으로 보여준다.
 * 우리 병원의 다른 표기가 경쟁 병원으로 섞여 들어온 것도 걸러 낸다.
 */
export function competitorFrequency(
  rows: ResultRow[],
  client?: { name: string; aliases?: string[] }
): CompetitorFrequencyEntry[] {
  const ours = client ? new Set(clientNameVariants(client.name, client.aliases ?? []).map(nameKey)) : new Set<string>();
  const groups = new Map<string, { counts: ProviderCounts; spellings: Map<string, number> }>();

  for (const r of rows) {
    if (!isProvider(r.provider)) continue;
    const seenInAnswer = new Set<string>();
    for (const raw of r.competitors ?? []) {
      const name = raw.trim();
      const key = nameKey(name);
      if (!key || ours.has(key) || seenInAnswer.has(key)) continue;
      seenInAnswer.add(key);
      const group = groups.get(key) ?? { counts: {}, spellings: new Map<string, number>() };
      bump(group.counts, r.provider);
      group.spellings.set(name, (group.spellings.get(name) ?? 0) + 1);
      groups.set(key, group);
    }
  }

  return Array.from(groups.values())
    .map(({ counts, spellings }) => {
      const ordered = [...spellings.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
      return { name: ordered[0], counts, total: sumCounts(counts), spellings: ordered };
    })
    .sort((a, b) => b.total - a.total);
}

/**
 * 노출 여부 외 지표.
 * - 점유율: 답변에 나온 병원 언급 전체(우리 + 경쟁) 중 우리 병원 비중
 * - 1순위 추천: 전체 답변 중 우리 병원이 가장 먼저 언급된 비율
 * - 홈페이지 인용: 출처가 붙은 답변 중 우리 홈페이지가 출처로 쓰인 비율
 */
export function visibilityMetrics(rows: ResultRow[], websiteUrl?: string | null): VisibilityMetrics {
  let ours = 0;
  let all = 0;
  let first = 0;
  let withSources = 0;
  let cited = 0;

  for (const r of rows) {
    const competitorCount = new Set((r.competitors ?? []).map(nameKey)).size;
    all += competitorCount + (r.mentioned ? 1 : 0);
    if (r.mentioned) ours += 1;
    if (r.mentioned && r.rank === 1) first += 1;
    const sources = r.sources ?? [];
    if (sources.length > 0) {
      withSources += 1;
      if (citesDomain(sources, websiteUrl)) cited += 1;
    }
  }

  return {
    shareOfVoice: { count: ours, total: all },
    firstPlace: { count: first, total: rows.length },
    ownCitation: { count: cited, total: withSources },
  };
}

export function sourceFrequency(rows: ResultRow[], limit = 10): SourceFrequencyEntry[] {
  const frequency = new Map<string, ProviderCounts>();
  for (const r of rows) {
    if (!isProvider(r.provider)) continue;
    // 한 답변이 같은 도메인을 여러 번 인용해도 1회로 센다. Gemini 출처는 제목에서 도메인을 읽는다.
    const domains = new Set<string>();
    for (const source of r.sources ?? []) {
      const host = sourceHost(source);
      if (host) domains.add(host);
    }
    for (const domain of domains) {
      const counts = frequency.get(domain) ?? {};
      bump(counts, r.provider);
      frequency.set(domain, counts);
    }
  }

  return Array.from(frequency.entries())
    .map(([domain, counts]) => ({ domain, counts, total: sumCounts(counts) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export function selfExposure(rows: ResultRow[]): SelfExposure {
  const byProvider: Partial<Record<Provider, ExposureTally>> = {};
  for (const r of rows) {
    if (!isProvider(r.provider)) continue;
    const tally = byProvider[r.provider] ?? { count: 0, total: 0 };
    tally.total += 1;
    if (r.mentioned) tally.count += 1;
    byProvider[r.provider] = tally;
  }

  return {
    count: rows.filter((r) => r.mentioned).length,
    total: rows.length,
    byProvider,
  };
}

export const EMPTY_SELF_EXPOSURE: SelfExposure = { count: 0, total: 0, byProvider: {} };
