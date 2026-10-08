import "server-only";
import { clientNameVariants, nameKey } from "./nameMatch";
import { naverSearchConfigured, searchPlaces, type Place } from "./naver/searchApi";
import { providerLabel, isProvider } from "./providers";
import { stripMarkdown } from "./text";
import type { LocationCheck, LocationClaim } from "./types";

/**
 * AI가 잘못 알고 있는 우리 병원 위치.
 *
 * AI 답변에서 우리 병원 이름 바로 뒤에 붙은 위치 표현("박진영병원 (단원구 선부동 / 선부역 인근)")을 뽑아,
 * 네이버 플레이스로 확인한 실제 위치와 견준다.
 * - 구·도로명: 실제 주소와 글자로 비교한다.
 * - 동·역: 그 동 행정복지센터나 역까지 실제 거리를 잰다. 행정동(중앙동)과 법정동(고잔동)이 달라
 *   글자만 보면 틀린 것처럼 보이는 경우가 있어서다.
 */

type Row = {
  provider: string;
  mentioned: boolean;
  raw_response: string | null;
  query_text?: string | null;
};

type ClientLike = { name: string; region?: string | null; aliases?: string[] | null };

/** 이 거리 안이면 맞음, 이 거리 밖이면 틀림 (km). 사이는 애매 */
const NEAR_KM = { station: 1.5, dong: 2.0 };
const FAR_KM = { station: 2.5, dong: 3.0 };
/** 네이버로 확인하는 동·역 수 상한 (검색 호출 수를 묶어 둔다) */
const MAX_LOOKUPS = 12;

/** 위치 표현이 아닌데 '-동·-역·-구'로 끝나는 말 */
const NOT_PLACE = new Set(["활동", "운동", "자동", "행동", "변동", "작동", "공동", "진동", "협동", "출동", "가동", "충동", "지역", "구역", "영역", "권역", "전역", "연구", "기구", "도구", "요구", "입구", "출구"]);

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** "경기도 안산시 단원구 …" → "안산" */
function cityOf(region: string | null | undefined): string {
  const city = (region ?? "").split(/\s+/).find((t) => /시$/.test(t) && !/특별시|광역시/.test(t));
  return city ? city.replace(/시$/, "") : "";
}

/** "고잔1동" → "고잔동" */
function normDong(dong: string): string {
  return dong.replace(/\d+(?=동$)/, "");
}

/** 답변 한 개에서 우리 병원 이름 바로 뒤에 붙은 위치 표현들 */
function claimsInAnswer(answer: string, names: string[]): { text: string; quote: string }[] {
  const text = stripMarkdown(answer);
  const covered: [number, number][] = [];
  const found = new Map<string, string>();
  for (const name of names) {
    for (let at = text.indexOf(name); at >= 0; at = text.indexOf(name, at + name.length)) {
      // 더 긴 이름("박진영병원") 안에 든 짧은 이름("박진영")은 건너뛴다
      if (covered.some(([s, e]) => at >= s && at < e)) continue;
      covered.push([at, at + name.length]);
      const line = text.slice(at, at + name.length + 100).split("\n")[0];
      const after = line.slice(name.length);
      const paren = after.match(/^\s*[(（]([^)）]{2,50})[)）]/);
      const phrase = after
        .slice(0, 60)
        .match(/(?:[가-힣]{1,4}구\s*)?[가-힣0-9]{1,8}(?:동|역)\s*(?:인근|근처|앞|부근|역세권|에\s*(?:위치|있))/);
      const claim = paren?.[1] ?? phrase?.[0];
      if (claim && !found.has(claim.trim())) found.set(claim.trim(), line.trim());
    }
  }
  return [...found].map(([claim, quote]) => ({ text: claim, quote }));
}

function tokensOf(claim: string) {
  const pick = (re: RegExp) => [...claim.matchAll(re)].map((m) => m[1]).filter((t) => !NOT_PLACE.has(t));
  return {
    gu: pick(/([가-힣]{1,4}구)(?![가-힣])/g),
    dong: pick(/([가-힣]{1,5}\d?동)(?![가-힣])/g),
    station: pick(/([가-힣A-Za-z0-9]{1,8}역)(?![가-힣])/g),
    road: pick(/([가-힣0-9]+(?:대로|로|길))\s*\d+/g),
  };
}

/** 네이버 플레이스에서 우리 병원 찾기 */
async function findOurPlace(client: ClientLike): Promise<Place | null> {
  const city = cityOf(client.region);
  const keys = clientNameVariants(client.name, client.aliases ?? []).map(nameKey);
  const places = await searchPlaces(`${city} ${client.name}`.trim(), 5);
  return places.find((p) => keys.some((k) => nameKey(p.title).includes(k))) ?? null;
}

export async function checkLocations(client: ClientLike, rows: Row[]): Promise<LocationCheck | null> {
  const names = clientNameVariants(client.name, client.aliases ?? [])
    .filter((n) => n.length >= 3)
    .sort((a, b) => b.length - a.length);

  // 답변별 위치 표현
  const perAnswer = rows
    .filter((r) => r.mentioned && r.raw_response && isProvider(r.provider))
    .map((r) => ({ row: r, claims: claimsInAnswer(r.raw_response!, names) }))
    .filter((a) => a.claims.some((c) => Object.values(tokensOf(c.text)).some((t) => t.length > 0)));
  if (perAnswer.length === 0) return null;

  // 실제 위치
  let ours: Place | null = null;
  if (naverSearchConfigured()) {
    try {
      ours = await findOurPlace(client);
    } catch (err) {
      console.error("[locationCheck] 우리 병원 위치 확인 실패", err);
    }
  }
  const words = (ours?.address || client.region || "").split(/\s+/);
  const actual = {
    address: ours?.address || client.region || "",
    roadAddress: ours?.roadAddress || client.region || "",
    gu: words.find((w) => /구$/.test(w)) ?? null,
    dong: ours ? (words.find((w) => /[가-힣0-9]+동$/.test(w)) ?? null) : null,
    lat: ours?.lat ?? null,
    lng: ours?.lng ?? null,
  };
  const here = ours?.lat && ours?.lng ? { lat: ours.lat, lng: ours.lng } : null;
  const city = cityOf(client.region);

  // 동·역까지 거리 (같은 이름은 한 번만 찾는다)
  const lookups = new Map<string, Promise<number | null>>();
  function distanceTo(kind: "station" | "dong", token: string): Promise<number | null> {
    const key = `${kind}:${token}`;
    if (!here || !naverSearchConfigured()) return Promise.resolve(null);
    if (!lookups.has(key)) {
      if (lookups.size >= MAX_LOOKUPS) return Promise.resolve(null);
      const query = kind === "station" ? `${city} ${token}` : `${city} ${token} 행정복지센터`;
      const stem = kind === "station" ? token : normDong(token).replace(/동$/, "");
      lookups.set(
        key,
        searchPlaces(query.trim(), 5)
          .then((places) => {
            const place = places.find((p) =>
              kind === "station"
                ? p.title.startsWith(token) || (p.title.includes(token) && /지하철|철도|역/.test(p.category))
                : p.title.includes(stem) && /행정복지센터|주민센터/.test(p.title + p.category)
            );
            return place?.lat && place?.lng ? distanceKm(here, { lat: place.lat, lng: place.lng }) : null;
          })
          .catch(() => null)
      );
    }
    return lookups.get(key)!;
  }

  /** 위치 표현 하나의 판정 */
  async function judge(text: string): Promise<{ verdict: LocationClaim["verdict"]; reason: string }> {
    const t = tokensOf(text);
    const wrong: string[] = [];
    const right: string[] = [];
    let unsure = false;

    for (const gu of t.gu) {
      if (!actual.gu) unsure = true;
      else if (gu === actual.gu) right.push(gu);
      else wrong.push(`실제는 ${actual.gu}인데 ${gu}`);
    }
    for (const road of t.road) {
      if (actual.roadAddress.includes(road)) right.push(road);
      else wrong.push(`도로명 ${road}는 실제 주소(${actual.roadAddress})와 다름`);
    }
    for (const dong of t.dong) {
      if (actual.dong && normDong(dong) === normDong(actual.dong)) {
        right.push(dong);
        continue;
      }
      const km = await distanceTo("dong", dong);
      if (km === null) unsure = true;
      else if (km <= NEAR_KM.dong) right.push(dong);
      else if (km >= FAR_KM.dong) wrong.push(`${dong}은 실제 위치에서 ${round1(km)}km`);
      else unsure = true;
    }
    for (const station of t.station) {
      const km = await distanceTo("station", station);
      if (km === null) unsure = true;
      else if (km <= NEAR_KM.station) right.push(`${station}(${round1(km)}km)`);
      else if (km >= FAR_KM.station) wrong.push(`${station}은 실제 위치에서 ${round1(km)}km`);
      else unsure = true;
    }

    if (wrong.length) return { verdict: "wrong", reason: wrong.join(" · ") };
    if (unsure || right.length === 0) return { verdict: "unsure", reason: "확인하지 못함" };
    return { verdict: "correct", reason: `실제 위치와 맞음 (${right.join(", ")})` };
  }

  // 같은 표현끼리 묶는다
  const groups = new Map<string, { answers: Set<number>; providers: Set<string>; example: LocationClaim["example"] }>();
  perAnswer.forEach(({ row, claims }, index) => {
    for (const claim of claims) {
      const key = claim.text.replace(/\s+/g, " ");
      const group = groups.get(key) ?? {
        answers: new Set<number>(),
        providers: new Set<string>(),
        example: { quote: claim.quote.slice(0, 160), question: row.query_text ?? null },
      };
      group.answers.add(index);
      group.providers.add(providerLabel(row.provider));
      groups.set(key, group);
    }
  });

  const claims: LocationClaim[] = [];
  for (const [text, group] of groups) {
    const { verdict, reason } = await judge(text);
    claims.push({ text, verdict, reason, count: group.answers.size, providers: [...group.providers], example: group.example });
  }
  const order = { wrong: 0, unsure: 1, correct: 2 } as const;
  claims.sort((a, b) => order[a.verdict] - order[b.verdict] || b.count - a.count);

  const wrongAnswers = new Set<number>();
  perAnswer.forEach(({ claims: mine }, index) => {
    if (mine.some((c) => claims.find((x) => x.text === c.text.replace(/\s+/g, " "))?.verdict === "wrong")) wrongAnswers.add(index);
  });

  return {
    actual: actual.address ? actual : null,
    mentions: perAnswer.length,
    wrong: wrongAnswers.size,
    claims: claims.slice(0, 8),
  };
}
