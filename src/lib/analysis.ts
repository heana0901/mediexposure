import OpenAI from "openai";
import { judgeResponse } from "./nameMatch";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export type AnalysisResult = {
  mentioned: boolean;
  rank: number | null;
  competitors: string[];
  /** 우리 병원이 처음 언급된 문장 (판정 근거). 미노출이면 null */
  evidence: string | null;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
};

const ANALYSIS_MODEL = process.env.ANALYSIS_MODEL || "gpt-4o-mini";

/**
 * AI에게는 '답변에 나온 다른 병원 이름'만 뽑게 한다.
 * 노출 여부·순위·근거는 답변 원문에서 글자로 확인해 정한다(judgeResponse).
 * AI에게 노출 여부까지 맡겼을 때 답변에 이름이 없는데도 '노출'로 기록된 일이 있었다.
 */
async function extractCompetitors(
  rawText: string,
  clientName: string,
  clientType: "hospital" | "business"
): Promise<{ competitors: string[]; inputTokens: number | null; outputTokens: number | null }> {
  const subject = clientType === "hospital" ? "병원" : "업체/브랜드";

  const completion = await getClient().chat.completions.create({
    model: ANALYSIS_MODEL,
    messages: [
      {
        role: "system",
        content: `너는 AI 답변에서 ${subject} 상호명을 뽑아내는 도구다. 반드시 JSON으로만 답하라.`,
      },
      {
        role: "user",
        content: `아래 텍스트에 등장하는 ${subject} 상호명을 등장 순서대로 모두 뽑아라. 단 "${clientName}"과 그 변형(띄어쓰기·지점명·'의원' 유무만 다른 이름)은 빼라.

- 텍스트에 실제로 적힌 표기 그대로 쓴다. 고치거나 지어내지 않는다.
- 질병·치료 설명만 있고 상호명이 없으면 빈 목록이다.

텍스트:
"""
${rawText}
"""`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "competitors",
        strict: true,
        schema: {
          type: "object",
          properties: { competitors: { type: "array", items: { type: "string" } } },
          required: ["competitors"],
          additionalProperties: false,
        },
      },
    },
  });

  let competitors: string[] = [];
  try {
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as { competitors?: unknown };
    if (Array.isArray(parsed.competitors)) {
      competitors = parsed.competitors.filter((c): c is string => typeof c === "string");
    }
  } catch {
    // 형식이 깨졌으면 경쟁 병원 없이 판정한다
  }

  return {
    competitors,
    inputTokens: completion.usage?.prompt_tokens ?? null,
    outputTokens: completion.usage?.completion_tokens ?? null,
  };
}

export async function analyzeResponse(
  rawText: string,
  clientName: string,
  clientType: "hospital" | "business" = "hospital",
  aliases: string[] = []
): Promise<AnalysisResult> {
  if (!rawText.trim()) {
    return { mentioned: false, rank: null, competitors: [], evidence: null, model: ANALYSIS_MODEL, inputTokens: null, outputTokens: null };
  }

  const extracted = await extractCompetitors(rawText, clientName, clientType);
  const judgement = judgeResponse(rawText, clientName, aliases, extracted.competitors);

  return {
    ...judgement,
    model: ANALYSIS_MODEL,
    inputTokens: extracted.inputTokens,
    outputTokens: extracted.outputTokens,
  };
}
