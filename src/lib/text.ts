export type AnswerSegment = { type: "text"; value: string } | { type: "link"; text: string; url: string };

const MARKDOWN_LINK = /\[([^\]]+)\]\(((?:https?:)?\/\/[^)\s]+)\)/g;
const BARE_URL = /https?:\/\/[^\s)<>"'\]]+/g;

/** 줄 단위 마크다운 기호만 지운다(앞뒤 공백은 그대로 두어 링크 사이 문장이 붙지 않게) */
function cleanInline(text: string): string {
  return text
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/__([\s\S]+?)__/g, "$1")
    .replace(/\*\*|__/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[\d+\]/g, "")
    .replace(/^\s*(?:---+|\*\*\*+)\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n");
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** 텍스트 안의 맨 주소(https://…)를 도메인 이름의 링크로 */
function splitBareUrls(text: string): AnswerSegment[] {
  const segments: AnswerSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(BARE_URL)) {
    const url = match[0].replace(/[.,;:!?]+$/, "");
    const index = match.index ?? 0;
    if (index > last) segments.push({ type: "text", value: text.slice(last, index) });
    segments.push({ type: "link", text: hostLabel(url), url });
    last = index + url.length;
  }
  if (last < text.length) segments.push({ type: "text", value: text.slice(last) });
  return segments;
}

/**
 * AI 답변을 화면용 조각으로 나눈다. 마크다운 기호는 지우되, [표시](주소)와 맨 주소는
 * 누를 수 있는 링크로 남긴다(새 탭으로 열어 출처를 바로 확인할 수 있게).
 */
export function parseAnswer(raw: string): AnswerSegment[] {
  const text = raw.replace(/\r\n/g, "\n").trim();
  const segments: AnswerSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(MARKDOWN_LINK)) {
    const index = match.index ?? 0;
    if (index > last) segments.push(...splitBareUrls(cleanInline(text.slice(last, index))));
    const url = match[2].startsWith("//") ? `https:${match[2]}` : match[2];
    segments.push({ type: "link", text: cleanInline(match[1]), url });
    last = index + match[0].length;
  }
  if (last < text.length) segments.push(...splitBareUrls(cleanInline(text.slice(last))));
  return segments;
}

/**
 * AI 답변에 섞여 오는 마크다운 기호를 걷어 내고 읽기 좋은 평문으로 만든다.
 * 저장된 원문은 그대로 두고 화면에 보여줄 때만 쓴다.
 */
export function stripMarkdown(text: string): string {
  return (
    text
      // [표시 글자](https://…) → 표시 글자
      .replace(/\[([^\]]+)\]\((?:https?:)?[^)\s]+\)/g, "$1")
      // **굵게**, __굵게__
      .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
      .replace(/__([\s\S]+?)__/g, "$1")
      // 짝이 안 맞아 남은 ** · __
      .replace(/\*\*|__/g, "")
      // # 제목
      .replace(/^#{1,6}\s+/gm, "")
      // `코드`
      .replace(/`([^`]+)`/g, "$1")
      // Perplexity식 인용 번호 [1][2]
      .replace(/\[\d+\]/g, "")
      // 구분선
      .replace(/^\s*(?:---+|\*\*\*+)\s*$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
