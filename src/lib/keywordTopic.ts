/**
 * 질문의 핵심 주제어(질환·시술·진료과).
 *
 * 같은 질문을 여러 표현으로 바꿔 물을 때, 표현이 바뀌어도 이 말은 그대로 있어야 같은 질문이다.
 * "디스크내장증"을 "목이 아픈데 신경외과 어디 가야 해?"로 바꾸면 다른 질문을 잰 것이 되어
 * 노출률이 실제와 달라진다. 그래서 지역명과 '병원·추천' 같은 일반어를 뺀 나머지를 주제어로 보고,
 * 모든 표현에 주제어가 글자 그대로 들어 있는지 기계적으로 확인한다.
 */

/** 주제가 아닌 말 (지역·주제어와 함께 붙는 일반어) */
const GENERIC = new Set([
  "병원", "의원", "클리닉", "추천", "잘하는", "잘하는곳", "잘보는", "잘보는곳", "유명한", "좋은", "근처", "주변", "가까운", "어디", "곳", "비용", "가격",
  // "이명 치료"와 "이명"은 같은 질문으로 본다. 수술·시술·검사는 의도가 달라 주제어로 남긴다
  "치료", "진료",
]);
/** 주제어 뒤에 붙여 쓰는 일반어: "이명병원" → "이명", "정형외과의원" → "정형외과" */
const GENERIC_SUFFIXES = ["병원", "의원"];
/** 이보다 많이 남으면 문장형 질문이라 주제어를 기계적으로 뽑지 않는다 */
const MAX_TOPIC_TOKENS = 3;

/** "경기도 안산시 단원구 광덕대로 181" → ["경기도", "경기", "안산시", "안산", "단원구", "단원"] */
export function regionForms(region: string | null | undefined): string[] {
  const forms: string[] = [];
  for (const token of (region ?? "").split(/\s+/)) {
    const long = token.match(/^(.+?)(특별자치시|특별자치도|특별시|광역시)$/);
    if (long) {
      forms.push(token, long[1]);
      continue;
    }
    if (!/^[가-힣]{2,}(도|시|군|구|동|읍|면)$/.test(token)) continue;
    forms.push(token);
    if (token.length >= 3) forms.push(token.slice(0, -1));
  }
  // 긴 것부터: "안산시정형외과"에서 "안산"보다 "안산시"를 먼저 뗀다
  return [...new Set(forms)].sort((a, b) => b.length - a.length);
}

export type RegionRule = {
  /** 표현에 쓸 지역 표기. 원래 질문에 지역이 있으면 그 표기, 없으면 시·군 이름. 모르면 빈 문자열 */
  place: string;
  /** 표현에 들어가면 안 되는 말: 원래 질문보다 좁거나 넓은 지역, 병원 도로명 주소 */
  banned: string[];
};

/**
 * 표현이 지켜야 할 지역 범위.
 *
 * 표현을 만들 때 병원 주소를 그대로 쓰면("광덕대로 181 신경외과") 우리 병원 위치를 AI에 알려 주는 셈이 되어
 * 노출률이 부풀고, 원래 "안산"으로 묻던 질문을 "단원구"로 좁히면 다른 질문을 재게 된다.
 * 그래서 원래 질문에 있는 지역 단계만 허용하고(없으면 시·군), 나머지 단계와 도로명은 금지한다.
 */
export function regionRule(keyword: string, region: string | null | undefined): RegionRule {
  const words = keyword.trim().split(/\s+/);
  type Level = { full: string; short: string | null; city: boolean };
  const levels: Level[] = [];
  const roads: string[] = [];
  for (const token of (region ?? "").split(/\s+/)) {
    const metro = token.match(/^(.+?)(특별자치시|특별자치도|특별시|광역시)$/);
    if (metro) levels.push({ full: token, short: metro[1], city: true });
    else if (/^[가-힣]{2,}(시|군)$/.test(token)) levels.push({ full: token, short: token.slice(0, -1), city: true });
    else if (/^[가-힣]{2,}(도|구|동|읍|면)$/.test(token)) levels.push({ full: token, short: token.length >= 3 ? token.slice(0, -1) : null, city: false });
    else if (/^[가-힣0-9]{2,}(로|길)$/.test(token)) roads.push(token);
  }

  // 주제어를 뽑을 때와 같은 기준: 단어가 지역명 그대로이거나, 지역명 뒤에 두 글자 이상 붙었을 때("안산정형외과")만
  // 지역으로 본다. "화정역"의 "화정"처럼 한 글자만 붙은 말은 지역이 아니라 주제어다.
  const names = (form: string | null) => form !== null && words.some((w) => w === form || (w.startsWith(form) && w.length - form.length >= 2));
  let allowed = levels.filter((l) => names(l.full) || names(l.short));
  let place = allowed.map((l) => (names(l.full) ? l.full : l.short!)).join(" ");
  if (allowed.length === 0) {
    // 원래 질문에 지역이 없으면 시·군 단위로만 묻는다
    allowed = levels.filter((l) => l.city).slice(-1);
    place = allowed[0]?.short ?? "";
  }

  const banned = levels
    .filter((l) => !allowed.includes(l))
    // 시·군은 줄임말("안산")도 흔히 쓰므로 함께 막고, 도·구·동은 정식 표기만 막는다
    .flatMap((l) => (l.city && l.short ? [l.full, l.short] : [l.full]));
  return { place, banned: [...banned, ...roads] };
}

/** 표현이 지역 범위를 지키는지 (금지된 지역·도로명이 없는지) */
export function keepsRegion(variant: string, rule: RegionRule): boolean {
  const compact = variant.replace(/\s+/g, "");
  return rule.banned.every((b) => !compact.includes(b));
}

/**
 * 질문에서 지역명과 일반어를 뺀 주제어들. "안산정형외과" → ["정형외과"], "허리디스크 수술 병원" → ["허리디스크", "수술"].
 * 지역·일반어만 있거나 문장형이라 뽑을 수 없으면 빈 배열.
 */
export function topicTokens(keyword: string, region?: string | null): string[] {
  const regions = regionForms(region);
  const topic: string[] = [];
  for (const raw of keyword.trim().split(/\s+/)) {
    let token = raw.replace(/[?!.,'"]/g, "");
    if (!token || regions.includes(token) || GENERIC.has(token)) continue;
    // 붙여 쓴 지역명: "안산정형외과" → "정형외과"
    const prefix = regions.find((r) => token.startsWith(r) && token.length - r.length >= 2);
    if (prefix) token = token.slice(prefix.length);
    for (const suffix of GENERIC_SUFFIXES) {
      if (token.endsWith(suffix) && token.length - suffix.length >= 2) token = token.slice(0, -suffix.length);
    }
    if (!GENERIC.has(token)) topic.push(token);
  }
  return topic.length <= MAX_TOPIC_TOKENS ? topic : [];
}

/**
 * 모델이 고른 주제어를 인정할지: 원래 질문에 글자 그대로 있고, 지역명·일반어가 아닐 때만.
 * 문장형 질문("귀에서 삐 소리가 나는데 이명인가요?")처럼 기계적으로 못 뽑을 때 쓴다.
 */
export function literalTopic(candidate: string | null | undefined, keyword: string, region?: string | null): string | null {
  const topic = (candidate ?? "").replace(/\s+/g, "");
  if (topic.length < 2 || topic.length > 12) return null;
  if (!keyword.replace(/\s+/g, "").includes(topic)) return null;
  if (GENERIC.has(topic) || regionForms(region).includes(topic)) return null;
  return topic;
}

/** 표현에 주제어가 모두 글자 그대로 들어 있는지 (띄어쓰기는 무시). 주제어가 없으면 확인할 수 없어 통과 */
export function staysOnTopic(variant: string, topic: string[]): boolean {
  const compact = variant.replace(/\s+/g, "");
  return topic.every((t) => compact.includes(t.replace(/\s+/g, "")));
}
