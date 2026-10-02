import { isProvider, type Provider } from "./providers";
import type {
  CompetitorFrequencyEntry,
  ExposureTally,
  ProviderCounts,
  SelfExposure,
  SourceFrequencyEntry,
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
  competitors?: string[] | null;
  sources?: { url: string }[] | null;
};

// Gemini grounding이 실제 출처 대신 반환하는 리다이렉트 도메인은 집계에서 제외
const IGNORED_SOURCE_DOMAINS = ["vertexaisearch.cloud.google.com"];

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

export function competitorFrequency(rows: ResultRow[]): CompetitorFrequencyEntry[] {
  const frequency = new Map<string, ProviderCounts>();
  for (const r of rows) {
    if (!isProvider(r.provider)) continue;
    for (const name of new Set(r.competitors ?? [])) {
      const counts = frequency.get(name) ?? {};
      bump(counts, r.provider);
      frequency.set(name, counts);
    }
  }

  return Array.from(frequency.entries())
    .map(([name, counts]) => ({ name, counts, total: sumCounts(counts) }))
    .sort((a, b) => b.total - a.total);
}

export function sourceFrequency(rows: ResultRow[], limit = 10): SourceFrequencyEntry[] {
  const frequency = new Map<string, ProviderCounts>();
  for (const r of rows) {
    if (!isProvider(r.provider)) continue;
    // 한 답변이 같은 도메인을 여러 번 인용해도 1회로 센다
    const domains = new Set<string>();
    for (const source of r.sources ?? []) {
      try {
        domains.add(new URL(source.url).hostname.replace(/^www\./, ""));
      } catch {
        // URL이 아닌 값은 건너뛴다
      }
    }
    for (const domain of domains) {
      if (IGNORED_SOURCE_DOMAINS.includes(domain)) continue;
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
