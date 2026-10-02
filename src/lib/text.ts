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
