import type { ClientType } from "../types";
import type { LocationHint } from "../location";

const SUBJECT: Record<ClientType, string> = {
  hospital: "병원",
  business: "업체",
};

/**
 * AI에게 "검색 결과를 재현하라"고 지시하는 공통 지침.
 * 키워드만 그대로 던지면 ChatGPT는 웹 검색 없이 질환/서비스 설명문을 내놓기 때문에,
 * 실제 상호명이 순위대로 나열되도록 답변 형식을 못박아 둔다.
 */
export function buildSearchInstructions(clientType: ClientType): string {
  const subject = SUBJECT[clientType];

  return [
    `너는 한국 사용자가 키워드를 검색했을 때 받게 되는 ${subject} 추천 결과를 재현하는 도우미다.`,
    "",
    "규칙:",
    `1. 답하기 전에 반드시 웹 검색을 수행하고, 검색 결과에 실제로 등장한 ${subject}만 언급한다.`,
    `2. 증상·질환·서비스에 대한 일반적인 설명만 늘어놓지 말고, 실제 운영 중인 ${subject}의 상호명을 답변의 중심에 둔다.`,
    "3. 키워드나 지역 정보에 지역명이 있으면 그 지역에 실제로 있는 곳만 고른다.",
    `4. 가장 많이 추천되는 순서대로 1번부터 번호를 매겨 최대 10곳까지 나열한다. 각 항목은 "상호명 - 위치 - 추천 이유 한 줄" 형식으로 쓴다.`,
    "5. 상호명은 간판에 적힌 정식 명칭 그대로 쓴다. 임의로 줄이거나 바꾸지 않는다.",
    `6. 검색 결과가 부족하면 찾은 곳만 쓰고 마지막 줄에 "검색 결과 부족"이라고 적는다. 없는 ${subject}을 만들어내지 않는다.`,
  ].join("\n");
}

/** 키워드 원문을 실제 검색 의도가 담긴 질문으로 감싼다. */
export function buildSearchQuestion(
  keyword: string,
  clientType: ClientType,
  location?: LocationHint | null
): string {
  const subject = SUBJECT[clientType];
  const lines = [keyword, "", `위 키워드로 지금 검색했을 때 추천되는 ${subject}을 순위대로 알려줘.`];

  const regionHint = location?.city ?? location?.region ?? null;
  if (regionHint && !keyword.includes(regionHint)) {
    lines.push(`검색하는 사람의 지역: ${[location?.region, location?.city].filter(Boolean).join(" ")}`);
  }

  return lines.join("\n");
}

/** 첫 호출에서 웹 검색을 건너뛴 경우 재시도에 덧붙이는 문구. */
export const SEARCH_RETRY_NUDGE =
  "먼저 웹 검색을 실행해서 최신 검색 결과를 확인한 뒤, 검색 결과에 나온 실제 상호명으로만 답해줘.";
