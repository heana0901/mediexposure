import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { nameKey } from "./nameMatch";

/**
 * 경쟁 병원이 실제로 있는 병원인지 건강보험심사평가원 병원정보서비스로 확인한다.
 *
 * AI가 지어낸 병원이나 표기가 엉뚱한 이름을 걸러 내고, 공식 상호로 보여주기 위해서다.
 * 공공데이터포털(data.go.kr)에서 '건강보험심사평가원_병원정보서비스' 활용 신청 후 받은
 * 일반 인증키를 HIRA_SERVICE_KEY에 넣으면 켜진다. 키가 없으면 아무것도 하지 않는다.
 * 같은 이름은 30일 동안 다시 묻지 않도록 hospital_registry 표에 저장해 둔다.
 */
const ENDPOINT = "https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList";
const CACHE_DAYS = 30;
/** 한 번 요청에서 새로 조회하는 최대 병원 수 (화면 응답 속도와 일일 호출 한도 보호) */
const MAX_LOOKUPS = 10;

export type RegistryMatch = { found: boolean; officialName: string | null; address: string | null };

type HiraItem = { yadmNm?: string; addr?: string; clCdNm?: string };

function serviceKey(): string | null {
  const key = process.env.HIRA_SERVICE_KEY?.trim();
  if (!key) return null;
  // 포털의 '인코딩' 키를 그대로 넣었으면 다시 인코딩하지 않는다
  return key.includes("%") ? key : encodeURIComponent(key);
}

/** "톡스앤필의원 불당점(천안)" → "톡스앤필의원" : 괄호와 지점명을 떼고 검색한다 */
function searchTerm(name: string): string {
  return name
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/\s+\S+점$/, "")
    .trim();
}

function toItems(json: unknown): HiraItem[] {
  const items = (json as { response?: { body?: { items?: { item?: HiraItem | HiraItem[] } | "" } } })?.response?.body
    ?.items;
  if (!items || typeof items !== "object") return [];
  const item = items.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

/** 이름이 정확히 같은 곳 → 지역이 맞는 곳 → 첫 번째 순으로 고른다 */
function pickBest(items: HiraItem[], name: string, regionTokens: string[]): HiraItem | null {
  const key = nameKey(name);
  const sameName = items.filter((i) => i.yadmNm && nameKey(i.yadmNm) === key);
  const pool = sameName.length ? sameName : items;
  return pool.find((i) => regionTokens.some((t) => i.addr?.includes(t))) ?? pool[0] ?? null;
}

async function lookup(name: string, regionTokens: string[], key: string): Promise<RegistryMatch | null> {
  const term = searchTerm(name);
  if (term.length < 2) return null;
  const url = `${ENDPOINT}?ServiceKey=${key}&pageNo=1&numOfRows=30&_type=json&yadmNm=${encodeURIComponent(term)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const text = await res.text();
    // 인증키 오류 등은 XML/JSON 헤더로 온다 → 판단 보류
    if (/SERVICE_KEY|SERVICE_ERROR|LIMITED_NUMBER/i.test(text) && !text.includes('"items"')) return null;
    const best = pickBest(toItems(JSON.parse(text)), name, regionTokens);
    return best
      ? { found: true, officialName: best.yadmNm ?? null, address: best.addr ?? null }
      : { found: false, officialName: null, address: null };
  } catch {
    return null;
  }
}

/**
 * 이름 목록을 확인해 nameKey → 결과로 돌려준다. 키가 없거나 확인하지 못한 이름은 빠진다.
 * region은 동명 병원 중 같은 지역을 고르는 데 쓴다(예: "경기도 고양시 덕양구 …").
 */
export async function verifyHospitals(
  supabase: SupabaseClient,
  names: string[],
  region?: string | null
): Promise<Map<string, RegistryMatch>> {
  const result = new Map<string, RegistryMatch>();
  const key = serviceKey();
  if (!key || names.length === 0) return result;

  const byKey = new Map(names.map((n) => [nameKey(n), n]));
  const keys = [...byKey.keys()].filter(Boolean);
  const since = new Date(Date.now() - CACHE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: cached, error } = await supabase
    .from("hospital_registry")
    .select("name_key, found, official_name, address")
    .in("name_key", keys)
    .gte("checked_at", since);
  if (error) return result; // 016 전이면 확인 기능을 쓰지 않는다

  for (const row of cached ?? []) {
    result.set(row.name_key, { found: row.found, officialName: row.official_name, address: row.address });
  }

  const regionTokens = (region ?? "").split(/\s+/).filter((t) => /(시|군|구)$/.test(t));
  const missing = keys.filter((k) => !result.has(k)).slice(0, MAX_LOOKUPS);
  const looked = await Promise.all(
    missing.map(async (k) => [k, await lookup(byKey.get(k)!, regionTokens, key)] as const)
  );

  const toCache = [];
  for (const [k, match] of looked) {
    if (!match) continue;
    result.set(k, match);
    toCache.push({
      name_key: k,
      query_name: byKey.get(k)!,
      found: match.found,
      official_name: match.officialName,
      address: match.address,
      checked_at: new Date().toISOString(),
    });
  }
  if (toCache.length) await supabase.from("hospital_registry").upsert(toCache);

  return result;
}
