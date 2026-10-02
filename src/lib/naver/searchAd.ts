import "server-only";
import { createHmac } from "node:crypto";

/**
 * 네이버 검색광고 API — 키워드 도구(월간 검색량·연관 키워드).
 *
 * 검색광고 관리시스템 > 도구 > API 사용 관리에서 받은 값을 환경변수에 넣으면 켜진다.
 *   NAVER_AD_API_KEY, NAVER_AD_SECRET_KEY, NAVER_AD_CUSTOMER_ID
 * 키워드 도구는 광고 계정과 무관한 조회라 고객 ID 하나로 모든 병원에 쓸 수 있다.
 */
const BASE_URL = "https://api.searchad.naver.com";
/** 키워드 도구가 한 번에 받는 힌트 키워드 수 */
const MAX_HINTS = 5;

export type KeywordStat = {
  /** 네이버가 돌려준 키워드 (띄어쓰기 없음) */
  keyword: string;
  pc: number;
  mobile: number;
  total: number;
  /** "< 10"처럼 정확한 값 대신 범위로 온 경우 */
  approx: boolean;
  /** 광고 경쟁 정도: 높음/중간/낮음 */
  competition: string | null;
};

type RawStat = {
  relKeyword: string;
  monthlyPcQcCnt: number | string;
  monthlyMobileQcCnt: number | string;
  compIdx?: string;
};

export function searchAdConfigured(): boolean {
  return Boolean(
    process.env.NAVER_AD_API_KEY?.trim() &&
      process.env.NAVER_AD_SECRET_KEY?.trim() &&
      process.env.NAVER_AD_CUSTOMER_ID?.trim()
  );
}

/** 키워드 도구는 띄어쓰기 없는 키워드만 받는다 */
export function toAdKeyword(text: string): string {
  return text.replace(/\s+/g, "").trim();
}

/** "< 10" 같은 값은 5로 본다(가중치 계산용 중간값) */
function count(value: number | string): { value: number; approx: boolean } {
  if (typeof value === "number") return { value, approx: false };
  const n = Number(String(value).replace(/[^\d]/g, ""));
  return String(value).includes("<") ? { value: 5, approx: true } : { value: Number.isFinite(n) ? n : 0, approx: false };
}

function sign(timestamp: string, method: string, uri: string, secret: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${method}.${uri}`).digest("base64");
}

async function keywordTool(hints: string[]): Promise<KeywordStat[]> {
  const apiKey = process.env.NAVER_AD_API_KEY!.trim();
  const secret = process.env.NAVER_AD_SECRET_KEY!.trim();
  const customer = process.env.NAVER_AD_CUSTOMER_ID!.trim();
  const uri = "/keywordstool";
  const timestamp = String(Date.now());
  const query = new URLSearchParams({ hintKeywords: hints.join(","), showDetail: "1" });

  const res = await fetch(`${BASE_URL}${uri}?${query}`, {
    headers: {
      "X-Timestamp": timestamp,
      "X-API-KEY": apiKey,
      "X-Customer": customer,
      "X-Signature": sign(timestamp, "GET", uri, secret),
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`네이버 검색광고 API 오류 (${res.status}) ${body.slice(0, 120)}`);
  }

  const json = (await res.json()) as { keywordList?: RawStat[] };
  return (json.keywordList ?? []).map((k) => {
    const pc = count(k.monthlyPcQcCnt);
    const mobile = count(k.monthlyMobileQcCnt);
    return {
      keyword: k.relKeyword,
      pc: pc.value,
      mobile: mobile.value,
      total: pc.value + mobile.value,
      approx: pc.approx || mobile.approx,
      competition: k.compIdx ?? null,
    };
  });
}

/**
 * 힌트 키워드들의 연관 키워드와 검색량. 5개씩 나눠 조회하고 키워드별로 합친다.
 * 결과에는 힌트 자신(정확히 일치하는 키워드)과 연관 키워드가 함께 들어 있다.
 */
export async function fetchKeywordStats(hints: string[]): Promise<KeywordStat[]> {
  const cleaned = [...new Set(hints.map(toAdKeyword).filter((h) => h.length >= 2))];
  const merged = new Map<string, KeywordStat>();
  for (let i = 0; i < cleaned.length; i += MAX_HINTS) {
    for (const stat of await keywordTool(cleaned.slice(i, i + MAX_HINTS))) {
      if (!merged.has(stat.keyword)) merged.set(stat.keyword, stat);
    }
  }
  return [...merged.values()];
}
