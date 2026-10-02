import type { LocationHint } from "../location";

export type Source = { title: string; url: string };

export type AiCallResult = {
  text: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  sources: Source[];
  /** 이번 호출에서 실제로 웹 검색이 실행됐는지 */
  searched: boolean;
  /** 모델이 실행한 검색어 */
  searchQueries: string[];
  /** 과금되는 웹검색 실행 횟수(재시도 포함). 비용 추정에 쓴다. */
  searchCount: number;
  /** 제공자가 실제 청구 금액을 돌려주면 그 값(USD). 없으면 토큰·검색 횟수로 추정한다. */
  costUsd?: number | null;
};

export type AskOptions = {
  /** 답변 형식을 못박는 시스템 지침 */
  instructions?: string;
  location?: LocationHint | null;
};

export type AskFn = (question: string, options?: AskOptions) => Promise<AiCallResult>;
