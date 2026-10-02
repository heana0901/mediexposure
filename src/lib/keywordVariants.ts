import "server-only";
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 질문 하나를 환자가 실제로 칠 법한 여러 표현으로 늘린다.
 *
 * 같은 의도라도 "고양시 이명 병원" · "귀에서 삐 소리 나는데 고양 이비인후과 어디가 좋아?"처럼
 * 표현이 바뀌면 AI 답이 달라진다. 표현 하나의 운에 숫자가 좌우되지 않도록, 반복 측정할 때
 * 회차마다 다른 표현으로 묻는다. 원래 질문은 항상 첫 번째로 쓴다.
 */
const VARIANT_MODEL = process.env.VARIANT_MODEL || process.env.ANALYSIS_MODEL || "gpt-4o-mini";

let client: OpenAI | null = null;
function getClient(): OpenAI {
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export type KeywordVariants = {
  variants: string[];
  /** 지명이 여러 지역에 있어 AI가 엉뚱한 지역으로 답할 수 있으면 그 경고 */
  note: string | null;
};

type ClientContext = { region?: string | null; department?: string | null; client_type?: string | null };

export async function generateVariants(keyword: string, context: ClientContext): Promise<KeywordVariants> {
  const subject = context.client_type === "business" ? "업체" : "병원";

  const completion = await getClient().chat.completions.create({
    model: VARIANT_MODEL,
    messages: [
      {
        role: "system",
        content: "너는 한국 사용자가 AI 검색창(ChatGPT·Gemini 등)에 입력하는 실제 검색 문장을 만드는 도구다. 반드시 JSON으로만 답하라.",
      },
      {
        role: "user",
        content: `원래 질문: "${keyword}"
${subject} 위치: ${context.region ?? "알 수 없음"}
진료과/업종: ${context.department ?? "알 수 없음"}

같은 의도로 사람들이 실제로 입력할 법한 다른 표현 3개를 만들어라.
- 1개는 증상·고민을 말하는 문장형 (예: "귀에서 삐 소리가 계속 나는데 고양시 어디 병원 가야 해?")
- 1개는 지역 + 추천 요청형 (예: "고양 이명 치료 잘하는 이비인후과 추천")
- 1개는 짧은 검색어형 (예: "덕양구 이명 병원")
- 원래 질문의 지역 범위를 지킨다. 원래 질문에 지역명이 없으면 위치를 바탕으로 같은 동네 지명을 쓴다.
- 특정 ${subject} 이름은 넣지 않는다.

또 원래 질문의 지명이 다른 지역에도 있어서 AI가 다른 지역으로 착각할 수 있으면 note에 한 문장으로 경고하고(예: "화정역은 고양시와 광주광역시에 모두 있습니다"), 아니면 null로 둔다.`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "keyword_variants",
        strict: true,
        schema: {
          type: "object",
          properties: {
            variants: { type: "array", items: { type: "string" } },
            note: { type: ["string", "null"] },
          },
          required: ["variants", "note"],
          additionalProperties: false,
        },
      },
    },
  });

  const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as Partial<KeywordVariants>;
  const original = keyword.replace(/\s+/g, "");
  const variants = [...new Set((parsed.variants ?? []).map((v) => String(v).trim()).filter(Boolean))]
    .filter((v) => v.replace(/\s+/g, "") !== original)
    .slice(0, 4);

  return { variants, note: parsed.note?.trim() || null };
}

/**
 * 표현이 아직 없는 질문들에 표현을 만들어 저장하고, 질문 id → 표현 목록을 돌려준다.
 * 만들기에 실패하거나 016 마이그레이션 전이면 원래 질문만 쓰도록 빈 목록을 돌려준다.
 */
export async function ensureVariants(
  supabase: SupabaseClient,
  keywords: { id: string; text: string; variants?: unknown }[],
  context: ClientContext
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  const missing: typeof keywords = [];

  for (const keyword of keywords) {
    const stored = Array.isArray(keyword.variants) ? keyword.variants.filter((v): v is string => typeof v === "string") : null;
    if (stored === null) {
      // 컬럼 자체가 없다(016 전) → 만들어도 저장할 곳이 없으니 원래 질문만 쓴다
      result.set(keyword.id, []);
    } else if (stored.length > 0) {
      result.set(keyword.id, stored);
    } else {
      missing.push(keyword);
    }
  }

  await Promise.all(
    missing.map(async (keyword) => {
      try {
        const generated = await generateVariants(keyword.text, context);
        result.set(keyword.id, generated.variants);
        await supabase
          .from("keywords")
          .update({ variants: generated.variants, variant_note: generated.note })
          .eq("id", keyword.id);
      } catch (err) {
        console.error("[variants] 표현 생성 실패", keyword.text, err);
        result.set(keyword.id, []);
      }
    })
  );

  return result;
}
