import { stripMarkdown } from "./text";

/**
 * 병원 이름 판정 규칙.
 *
 * '노출'은 답변 본문에 우리 병원 이름(또는 등록한 별칭)이 글자로 실제 있을 때만 인정한다.
 * AI 판정만 믿었을 때 답변에 이름이 아예 없는데도 '노출'로 기록된 사례가 있었기 때문이다
 * (이음이비인후과: '노출' 23건 중 11건). 순위도 AI에게 묻지 않고 답변에 병원이 처음 등장한
 * 순서로 계산해, 같은 답변이면 언제 다시 판정해도 같은 결과가 나오게 한다.
 */

/** 비교용 정규화: 공백·기호를 지우고 영문은 소문자로 */
function compact(text: string): string {
  return text.toLowerCase().replace(/[\s·・\-_.,'"“”‘’()[\]{}<>!?~:;/\\|*#`]/g, "");
}

/** "산부인과의원" → "산부인과"처럼, 진료과 뒤에 붙은 '의원'은 떼어도 같은 병원이다 */
function stripClinicSuffix(name: string): string {
  return name.replace(/(과)의원$/, "$1");
}

/**
 * 경쟁 병원 이름을 한 병원으로 묶기 위한 키.
 * "서울이비인후과의원" · "서울이비인후과" · "서울 이비인후과(본점)"이 모두 같은 키가 된다.
 */
export function nameKey(name: string): string {
  const withoutNotes = name.replace(/\(.*?\)|\[.*?\]/g, "");
  return stripClinicSuffix(compact(withoutNotes));
}

/**
 * 우리 병원을 가리키는 이름 후보.
 * 등록 이름과 별칭 + 앞의 지역명을 뗀 이름("천안 엘츠의원" → "엘츠의원") + 진료과 뒤 '의원'을 뗀 이름.
 * 너무 짧아 다른 말과 겹칠 수 있는 후보(2글자 이하)는 쓰지 않는다.
 */
export function clientNameVariants(name: string, aliases: string[] = []): string[] {
  const variants = new Set<string>();
  for (const raw of [name, ...aliases]) {
    const base = raw.trim();
    if (!base) continue;
    const candidates = [base];
    const tokens = base.split(/\s+/);
    if (tokens.length > 1) candidates.push(tokens.slice(1).join(""));
    for (const candidate of candidates) {
      const c = compact(candidate);
      variants.add(c);
      variants.add(stripClinicSuffix(c));
    }
  }
  return [...variants].filter((v) => v.length >= 3 && !GENERIC_NAME.test(v)).sort((a, b) => b.length - a.length);
}

/** 진료과 이름만 남은 후보("이비인후과의원")는 아무 병원에나 걸리므로 쓰지 않는다 */
const GENERIC_NAME =
  /^(이비인후과|산부인과|피부과|정형외과|신경외과|성형외과|흉부외과|항외과|외과|내과|안과|치과|한의원|비뇨기과|비뇨의학과|소아과|소아청소년과|가정의학과|재활의학과|정신건강의학과|영상의학과|마취통증의학과|신경과|의원|병원|클리닉|한방병원|요양병원)(의원|병원)?$/;

/** 원문 위치를 기억하는 정규화 문자열. 찾은 위치로 근거 문장을 잘라 오기 위해 쓴다. */
function compactWithIndex(text: string): { value: string; origin: number[] } {
  let value = "";
  const origin: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = compact(text[i]);
    if (!c) continue;
    value += c;
    for (let k = 0; k < c.length; k++) origin.push(i);
  }
  return { value, origin };
}

type Located = { index: number; length: number };

function locate(haystack: string, needles: string[]): Located | null {
  let best: Located | null = null;
  for (const needle of needles) {
    if (!needle) continue;
    const index = haystack.indexOf(needle);
    if (index !== -1 && (!best || index < best.index)) best = { index, length: needle.length };
  }
  return best;
}

/** 근거 문장: 처음 언급된 줄을 마크다운 없이 최대 160자로 */
function evidenceAt(text: string, originIndex: number): string {
  const lineStart = text.lastIndexOf("\n", originIndex) + 1;
  const lineEndRaw = text.indexOf("\n", originIndex);
  const lineEnd = lineEndRaw === -1 ? text.length : lineEndRaw;
  let line = stripMarkdown(text.slice(lineStart, lineEnd)).trim();
  if (line.length > 160) {
    const offset = Math.max(0, originIndex - lineStart - 60);
    line = (offset > 0 ? "…" : "") + line.slice(offset, offset + 160).trim() + "…";
  }
  return line;
}

export type Judgement = {
  mentioned: boolean;
  rank: number | null;
  /** 답변에 실제로 등장한 경쟁 병원만 (우리 병원 이름은 제외) */
  competitors: string[];
  /** 우리 병원이 처음 언급된 문장. 미노출이면 null */
  evidence: string | null;
};

/**
 * 답변 원문으로 노출 여부·순위·근거를 판정한다. AI가 뽑은 경쟁 병원 목록은 후보로만 쓰고,
 * 답변에 글자로 없는 이름은 버린다.
 */
export function judgeResponse(
  rawText: string,
  clientName: string,
  aliases: string[],
  competitorCandidates: string[]
): Judgement {
  const { value, origin } = compactWithIndex(rawText);
  const ours = clientNameVariants(clientName, aliases);
  const ourKeys = new Set(ours.map(stripClinicSuffix));

  const seen = new Set<string>();
  const competitors: { name: string; index: number }[] = [];
  for (const name of competitorCandidates) {
    const key = nameKey(name);
    if (!key || seen.has(key) || ourKeys.has(key) || ours.some((o) => key.includes(o) || o.includes(key))) continue;
    const found = locate(value, [compact(name.replace(/\(.*?\)|\[.*?\]/g, "")), key]);
    if (!found) continue;
    seen.add(key);
    competitors.push({ name: name.trim(), index: found.index });
  }

  const hit = locate(value, ours);
  if (!hit) {
    return { mentioned: false, rank: null, competitors: competitors.map((c) => c.name), evidence: null };
  }

  const rank = 1 + competitors.filter((c) => c.index < hit.index).length;
  return {
    mentioned: true,
    rank,
    competitors: competitors.map((c) => c.name),
    evidence: evidenceAt(rawText, origin[hit.index] ?? 0),
  };
}

/** 출처 URL 목록에 우리 홈페이지 도메인이 있는지 */
export function citesDomain(urls: string[], websiteUrl: string | null | undefined): boolean {
  const domain = (websiteUrl ?? "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[/?#]/)[0]
    .toLowerCase();
  if (!domain) return false;
  return urls.some((url) => {
    try {
      const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
      return host === domain || host.endsWith(`.${domain}`);
    } catch {
      return false;
    }
  });
}
