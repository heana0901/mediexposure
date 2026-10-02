import "server-only";
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchKeywordStats, searchAdConfigured, toAdKeyword } from "./searchAd";
import { percent } from "../stats";
import type { DemandSummary } from "../types";

/**
 * 질문별 '실제 검색 수요'.
 *
 * 모니터링 질문은 "고양시 이명 잘 보는 병원"처럼 문장일 수 있는데, 네이버 검색량은
 * "고양 이명 병원" 같은 짧은 검색어 단위로만 나온다. 그래서 질문마다 대표 검색어를 하나
 * 정해 두고(짧은 질문은 그대로, 문장은 AI가 줄인다) 그 검색어의 월간 검색량을 가중치로 쓴다.
 */
const VOLUME_TTL_DAYS = 30;
const MODEL = process.env.VARIANT_MODEL || process.env.ANALYSIS_MODEL || "gpt-4o-mini";

type KeywordRow = {
  id: string;
  text: string;
  search_keyword?: string | null;
  search_volume?: number | null;
  search_volume_note?: string | null;
  search_volume_checked_at?: string | null;
};

let client: OpenAI | null = null;
function getClient(): OpenAI {
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

/** 이미 검색어처럼 짧은 질문은 그대로 대표 검색어로 쓴다 */
function ruleBasedKeyword(text: string): string | null {
  const trimmed = text.trim();
  const tokens = trimmed.split(/\s+/);
  return tokens.length <= 4 && trimmed.length <= 20 && !/[?？]$/.test(trimmed) ? trimmed : null;
}

async function shortenWithAi(text: string): Promise<string | null> {
  const completion = await getClient().chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: "너는 문장을 네이버 검색창에 입력하는 짧은 검색어로 바꾸는 도구다. 반드시 JSON으로만 답하라." },
      {
        role: "user",
        content: `"${text}"\n\n이 질문을 한 사람이 네이버에 칠 법한 대표 검색어 하나를 2~4단어로 만들어라. 지역명과 핵심 증상·진료는 남기고 "잘하는", "추천" 같은 말은 꼭 필요할 때만 남긴다. 예: "고양시 이명 잘 보는 병원 어디야?" → "고양 이명 병원"`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "search_keyword",
        strict: true,
        schema: {
          type: "object",
          properties: { keyword: { type: "string" } },
          required: ["keyword"],
          additionalProperties: false,
        },
      },
    },
  });
  const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as { keyword?: string };
  return parsed.keyword?.trim() || null;
}

/** 대표 검색어가 없는 질문에 검색어를 정해 저장한다. 017 이전이면 아무것도 하지 않는다. */
export async function ensureSearchKeywords(supabase: SupabaseClient, keywords: KeywordRow[]): Promise<void> {
  const missing = keywords.filter((k) => k.search_keyword === null);
  await Promise.all(
    missing.map(async (k) => {
      try {
        const keyword = ruleBasedKeyword(k.text) ?? (await shortenWithAi(k.text)) ?? k.text;
        k.search_keyword = keyword;
        await supabase.from("keywords").update({ search_keyword: keyword }).eq("id", k.id);
      } catch (err) {
        console.error("[demand] 대표 검색어 생성 실패", k.text, err);
      }
    })
  );
}

/** 검색량이 없거나 30일이 지난 질문만 네이버 검색광고 API로 다시 조회한다 */
export async function refreshSearchVolumes(supabase: SupabaseClient, keywords: KeywordRow[]): Promise<void> {
  if (!searchAdConfigured()) return;
  const staleBefore = Date.now() - VOLUME_TTL_DAYS * 24 * 60 * 60 * 1000;
  const stale = keywords.filter(
    (k) =>
      k.search_keyword &&
      (!k.search_volume_checked_at || Date.parse(k.search_volume_checked_at) < staleBefore)
  );
  if (stale.length === 0) return;

  const stats = await fetchKeywordStats(stale.map((k) => k.search_keyword!));
  const byKeyword = new Map(stats.map((s) => [s.keyword, s]));
  const checkedAt = new Date().toISOString();

  await Promise.all(
    stale.map(async (k) => {
      const stat = byKeyword.get(toAdKeyword(k.search_keyword!));
      const patch = {
        search_volume: stat ? stat.total : 0,
        search_volume_note: stat ? (stat.approx ? "10회 미만" : null) : "집계 없음",
        search_volume_checked_at: checkedAt,
      };
      Object.assign(k, patch);
      await supabase.from("keywords").update(patch).eq("id", k.id);
    })
  );
}

/**
 * 검색 수요를 반영한 AI 추천 확률.
 * 질문별 AI 추천 확률을 그 질문(대표 검색어)의 월간 검색량으로 가중 평균한다.
 */
export function demandSummary(
  keywords: KeywordRow[],
  rows: { keyword_id: string | null; mentioned: boolean }[]
): DemandSummary {
  const tallies = new Map<string, { count: number; total: number }>();
  for (const r of rows) {
    if (!r.keyword_id) continue;
    const t = tallies.get(r.keyword_id) ?? { count: 0, total: 0 };
    t.total += 1;
    if (r.mentioned) t.count += 1;
    tallies.set(r.keyword_id, t);
  }

  const items = keywords.map((k) => {
    const t = tallies.get(k.id) ?? { count: 0, total: 0 };
    return {
      keywordId: k.id,
      text: k.text,
      searchKeyword: k.search_keyword ?? null,
      volume: k.search_volume ?? null,
      volumeNote: k.search_volume_note ?? null,
      hits: t.count,
      total: t.total,
      rate: percent(t.count, t.total),
    };
  });

  const weighted = items.filter((i) => (i.volume ?? 0) > 0 && i.total > 0);
  const totalVolume = weighted.reduce((sum, i) => sum + (i.volume ?? 0), 0);
  const weightedRate =
    totalVolume > 0
      ? Math.round(weighted.reduce((sum, i) => sum + (i.volume ?? 0) * (i.hits / i.total), 0) / totalVolume * 100)
      : null;

  return {
    configured: searchAdConfigured(),
    weightedRate,
    totalVolume,
    items: items.sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1)),
  };
}
