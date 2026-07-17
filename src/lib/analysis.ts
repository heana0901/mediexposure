import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type AnalysisResult = {
  mentioned: boolean;
  rank: number | null;
  competitors: string[];
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
};

const ANALYSIS_MODEL = process.env.ANALYSIS_MODEL || "gpt-4o-mini";

const EMPTY_RESULT: AnalysisResult = {
  mentioned: false,
  rank: null,
  competitors: [],
  model: ANALYSIS_MODEL,
  inputTokens: null,
  outputTokens: null,
};

export async function analyzeResponse(
  rawText: string,
  clientName: string
): Promise<AnalysisResult> {
  if (!rawText.trim()) return EMPTY_RESULT;

  const completion = await client.chat.completions.create({
    model: ANALYSIS_MODEL,
    messages: [
      {
        role: "system",
        content:
          "너는 AI 응답 텍스트를 분석해서 특정 병원이 언급되었는지, 몇 번째 순서로 언급되었는지, 함께 언급된 다른 병원(경쟁 병원) 이름을 추출하는 도구다. 반드시 JSON으로만 답하라.",
      },
      {
        role: "user",
        content: `분석 대상 병원명: "${clientName}"

아래는 AI가 특정 키워드에 대해 답변한 텍스트다. 이 텍스트에 분석 대상 병원이 언급되었는지, 언급되었다면 텍스트에 나열된 병원들 중 몇 번째 순서로 언급되었는지(1부터 시작), 그리고 분석 대상 병원을 제외하고 언급된 다른 병원명 목록을 뽑아라.

텍스트:
"""
${rawText}
"""`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "analysis_result",
        strict: true,
        schema: {
          type: "object",
          properties: {
            mentioned: { type: "boolean" },
            rank: { type: ["integer", "null"] },
            competitors: { type: "array", items: { type: "string" } },
          },
          required: ["mentioned", "rank", "competitors"],
          additionalProperties: false,
        },
      },
    },
  });

  const usage = {
    model: ANALYSIS_MODEL,
    inputTokens: completion.usage?.prompt_tokens ?? null,
    outputTokens: completion.usage?.completion_tokens ?? null,
  };

  const content = completion.choices[0]?.message?.content;
  if (!content) return { ...EMPTY_RESULT, ...usage };

  try {
    const parsed = JSON.parse(content) as AnalysisResult;
    return {
      mentioned: Boolean(parsed.mentioned),
      rank: parsed.rank ?? null,
      competitors: Array.isArray(parsed.competitors) ? parsed.competitors : [],
      ...usage,
    };
  } catch {
    return { mentioned: rawText.includes(clientName), rank: null, competitors: [], ...usage };
  }
}
