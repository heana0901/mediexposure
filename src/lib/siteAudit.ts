import "server-only";
import OpenAI from "openai";

import {
  AXIS_META,
  gradeOf,
  type SiteComparisonResult,
  type SiteDiagnosis,
} from "./diagnose-shared";
import { diagnosisSummary, DiagnosisError, normalizeTargetUrl, runDiagnosis } from "./diagnose";

export type {
  Axis,
  AxisScore,
  CheckResult,
  CheckStatus,
  SiteComparisonResult,
  SiteDiagnosis,
} from "./diagnose-shared";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ANALYSIS_MODEL = process.env.ANALYSIS_MODEL || "gpt-4o-mini";

/** 진단 자체가 불가능했던 사이트도 결과 배열에 자리를 차지해야 비교 표가 어긋나지 않습니다. */
function failedSite(rawUrl: string, message: string): SiteDiagnosis {
  return {
    url: rawUrl,
    finalUrl: rawUrl,
    title: "",
    score: 0,
    grade: gradeOf(0),
    responseMs: 0,
    axes: [],
    checks: [],
    priorities: [],
    error: message,
  };
}

async function diagnoseOne(rawUrl: string): Promise<SiteDiagnosis> {
  try {
    const target = await normalizeTargetUrl(rawUrl);
    return await runDiagnosis(target);
  } catch (error) {
    if (error instanceof DiagnosisError) return failedSite(rawUrl, error.message);
    console.error("[site-audit] 진단 실패", rawUrl, error);
    return failedSite(rawUrl, "진단 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
  }
}

/** OpenAI 오류를 화면에 그대로 띄울 수 있는 한국어 문장으로 바꿉니다. */
function describeAiError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/no credits remaining|insufficient_quota|credit_balance_exhausted/i.test(message)) {
    return "OpenAI API 크레딧이 소진되어 AI 진단 코멘트를 만들지 못했습니다. platform.openai.com > Billing에서 크레딧을 충전하세요. (ChatGPT Plus 구독료는 API 크레딧과 별개입니다)";
  }
  if (/401|invalid[_ ]api[_ ]key|Incorrect API key/i.test(message)) {
    return "OpenAI API 키가 올바르지 않습니다. 환경변수 OPENAI_API_KEY를 확인하세요.";
  }
  if (/429|rate limit/i.test(message)) {
    return "OpenAI 호출이 일시적으로 제한되었습니다. 잠시 후 다시 시도해 주세요.";
  }
  return `AI 진단 코멘트를 만들지 못했습니다: ${message}`;
}

const SINGLE_SITE_PROMPT = `너는 웹사이트가 ChatGPT, Gemini 같은 생성형 AI 검색엔진에 얼마나 잘 노출·인용될 수 있는지 진단하는 GEO(Generative Engine Optimization) 전문가다.

입력으로 25개 항목 체크리스트 결과와 4개 축(SEO 기술 최적화 40%, AEO AI 인용 준비도 20%, GEO 엔티티 인식 20%, 네이버 대응 20%) 점수, 100점 만점 총점이 주어진다.

형식 (한국어, 마크다운 없이 일반 텍스트로):
1. 총점과 가장 낮은 축을 먼저 한 문장으로 진단하라.
2. 총점을 끌어올리는 데 가장 효과가 큰 문제 3가지를 순서대로 짚되, 각 문제마다 체크리스트의 실제 결과값(수치·발견된 문구)을 직접 인용해 왜 문제인지 설명하라.
3. 문제마다 바로 적용 가능한 개선 방법을 제시하라. 가능하면 실제로 붙여넣을 수 있는 예시(개선된 meta description 문안, JSON-LD 스키마 종류 등)를 직접 써 줘라.
4. "콘텐츠를 보강하세요" 같은 추상적 조언은 쓰지 마라.`;

const COMPARISON_PROMPT = `너는 여러 웹사이트가 ChatGPT, Gemini 같은 생성형 AI 검색엔진에 얼마나 잘 노출·인용될 수 있는지 비교 진단하는 GEO(Generative Engine Optimization) 전문가다. 첫 번째 사이트가 분석 대상(우리 사이트)이고 나머지는 경쟁사다.

입력으로 각 사이트의 25개 항목 체크리스트 결과와 4개 축 점수, 100점 만점 총점이 주어진다.

형식 (한국어, 마크다운 없이 일반 텍스트로):
1. 우리 사이트와 경쟁사의 총점·축별 점수 차이를 먼저 한 문단으로 요약하라.
2. 우리 사이트가 뒤처지는 체크 항목을 실제 결과값을 인용해 구체적으로 짚어라.
3. 경쟁사가 잘하고 있어서 따라할 만한 것을 구체적으로 제시하라.
4. 문제마다 바로 적용 가능한 개선 방법을 실제 예시(문안, 스키마 종류 등)와 함께 제시하라.`;

/**
 * URL 목록(첫 번째가 분석 대상, 나머지는 경쟁사)을 진단합니다.
 *
 * 각 사이트 진단은 병렬로 돕니다. 사이트마다 9초 타임아웃이 걸려 있어
 * 4곳을 병렬로 돌려도 서버리스 함수 실행 제한 안에 들어옵니다.
 */
export async function runComparativeSiteAudit(rawUrls: string[]): Promise<SiteComparisonResult> {
  const sites = await Promise.all(rawUrls.map(diagnoseOne));

  const usable = sites.filter((s) => !s.error);
  let aiComment: string | null = null;
  let aiCommentError: string | null = null;

  if (usable.length === 0) {
    aiCommentError = "진단에 성공한 사이트가 없어 AI 코멘트를 만들지 않았습니다.";
  } else {
    const isComparison = usable.length > 1;
    const combinedSummary = sites.map(diagnosisSummary).join("\n\n---\n\n");
    const axisGuide = Object.values(AXIS_META)
      .map((a) => `${a.short}(${a.label}, 총점 비중 ${a.weight}%): ${a.description}`)
      .join("\n");

    try {
      const completion = await openai.chat.completions.create({
        model: ANALYSIS_MODEL,
        messages: [
          { role: "system", content: isComparison ? COMPARISON_PROMPT : SINGLE_SITE_PROMPT },
          { role: "user", content: `축 설명:\n${axisGuide}\n\n${combinedSummary}` },
        ],
      });
      aiComment = completion.choices[0]?.message?.content ?? null;
      if (!aiComment) aiCommentError = "AI가 빈 응답을 반환했습니다.";
    } catch (error) {
      console.error("[site-audit] AI 코멘트 실패", error);
      aiCommentError = describeAiError(error);
    }
  }

  return {
    version: 2,
    sites,
    aiComment,
    aiCommentError,
    checkedAt: new Date().toISOString(),
  };
}
