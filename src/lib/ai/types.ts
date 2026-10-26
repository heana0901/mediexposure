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
  /** (조건 비교 실험용) 환경변수 대신 쓸 모델 */
  model?: string;
  /** (ChatGPT 실험용) false면 검색을 강제하지 않고 모델에 맡긴다. 기본은 강제 */
  forceSearch?: boolean;
  /** (Gemini 실험용) 구글 지도 그라운딩을 함께 켠다. 사용자 위치 좌표 */
  maps?: { latitude: number; longitude: number } | null;
  /** (ChatGPT) 검색해서 읽어 오는 자료량. 많을수록 비용이 크다 */
  searchContext?: "low" | "medium" | "high";
  /** 이 신호가 오면 호출을 끊는다. 서버 함수 시간 한도 전에 받은 답변까지 저장하기 위해서다 */
  signal?: AbortSignal;
};

export type AskFn = (question: string, options?: AskOptions) => Promise<AiCallResult>;
