/**
 * AI 제공자 호출 오류를 화면에 그대로 띄울 수 있는 한국어 문장으로 바꿉니다.
 *
 * 특히 OpenAI의 "no credits remaining"은 원인이 결제/크레딧이라는 점을
 * 명확히 알려주지 않으면 "AI가 우리를 언급하지 않았다"는 결과로 오해하기 쉽습니다.
 */
export function describeAiError(error: unknown, provider?: string): string {
  const message = error instanceof Error ? error.message : String(error);
  const who = provider === "gemini" ? "Gemini" : provider === "chatgpt" ? "ChatGPT" : "AI";

  if (/no credits remaining|insufficient_quota|credit_balance_exhausted/i.test(message)) {
    return `${who}: OpenAI API 크레딧이 소진되었습니다. platform.openai.com > Settings > Billing에서 크레딧을 충전하세요. (ChatGPT Plus 구독료는 API 크레딧과 별개입니다)`;
  }
  if (/401|invalid[_ ]api[_ ]key|Incorrect API key|API key not valid/i.test(message)) {
    return `${who}: API 키가 올바르지 않습니다. 환경변수 설정을 확인하세요.`;
  }
  if (/quota|RESOURCE_EXHAUSTED/i.test(message)) {
    return `${who}: 사용 한도를 초과했습니다. 결제 상태와 할당량을 확인하세요.`;
  }
  if (/429|rate limit/i.test(message)) {
    return `${who}: 호출이 일시적으로 제한되었습니다. 잠시 후 다시 시도해 주세요.`;
  }
  if (/timeout|ETIMEDOUT|ECONNRESET|fetch failed/i.test(message)) {
    return `${who}: 응답을 받지 못했습니다(네트워크 오류). 잠시 후 다시 시도해 주세요.`;
  }
  return `${who}: 호출 실패 — ${message}`;
}
