import "server-only";
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cityName, literalTopic, staysOnTopic, topicTokens } from "./keywordTopic";

/**
 * 질문 하나를 환자가 실제로 칠 법한 여러 표현으로 늘린다.
 *
 * 같은 의도라도 "고양시 이명 병원" · "귀에서 삐 소리 나는데 이명인가요? 고양 어디 병원 가야 해요?"처럼
 * 표현이 바뀌면 AI 답이 달라진다. 표현 하나의 운에 숫자가 좌우되지 않도록, 반복 측정할 때
 * 회차마다 다른 표현으로 묻는다. 원래 질문은 항상 첫 번째로 쓴다.
 *
 * 표현을 바꾸다 주제가 바뀌면("디스크내장증" → "목이 아픈데 신경외과 어디?") 다른 질문을 재게 되므로,
 * 모든 표현에 핵심 주제어가 글자 그대로 들어 있는지 확인하고 빠진 표현은 버린다.
 */
const VARIANT_MODEL = process.env.VARIANT_MODEL || "gpt-5.4-mini";
/** 표현 개수 */
const WANTED = 3;

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

type Draft = { variants: string[]; note: string | null; topic: string | null };

async function draft(keyword: string, context: ClientContext, topic: string[], retryNote: string | null): Promise<Draft> {
  const subject = context.client_type === "business" ? "업체" : "병원";
  const topicLine = topic.length
    ? `핵심 주제어: ${topic.map((t) => `"${t}"`).join(", ")}`
    : "핵심 주제어: 원래 질문에서 질환·시술·진료과 이름을 글자 그대로 골라 topic에 적는다 (없으면 null)";

  const completion = await getClient().chat.completions.create({
    model: VARIANT_MODEL,
    ...(VARIANT_MODEL.startsWith("gpt-5") ? { reasoning_effort: "low" as const } : {}),
    messages: [
      {
        role: "system",
        content: "너는 한국 사용자가 AI 검색창(ChatGPT·Gemini 등)에 입력하는 실제 검색 문장을 만드는 도구다. 반드시 JSON으로만 답하라.",
      },
      {
        role: "user",
        content: `원래 질문: "${keyword}"
${topicLine}
${subject} 위치: ${context.region ?? "알 수 없음"}
진료과/업종: ${context.department ?? "알 수 없음"} (참고용)

같은 것을 묻는 다른 표현 ${WANTED}개를 만들어라.
- 모든 표현에 핵심 주제어를 글자 그대로 넣는다. 다른 질환·증상·시술·진료과로 바꾸지 않는다.
  나쁜 예: 원래 질문이 "디스크내장증"인데 "목이 아픈데 신경외과 어디 가야 해?" (주제어가 사라져 다른 질문이 됨)
- 1개는 고민을 말하는 문장형. 주제어를 함께 쓴다 (예: 주제어가 "이명"이면 "귀에서 삐 소리가 계속 나는데 이명인가요? 고양시 어디 병원 가야 해요?")
- 1개는 지역 + 추천 요청형 (예: "고양 이명 치료 잘하는 이비인후과 추천")
- 1개는 짧은 검색어형 (예: "덕양구 이명 병원")
- 원래 질문의 지역 범위를 지킨다. 원래 질문에 지역명이 없으면 위치를 바탕으로 같은 동네 지명을 쓴다.
- 특정 ${subject} 이름은 넣지 않는다.${retryNote ? `\n- ${retryNote}` : ""}

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
            topic: { type: ["string", "null"] },
            variants: { type: "array", items: { type: "string" } },
            note: { type: ["string", "null"] },
          },
          required: ["topic", "variants", "note"],
          additionalProperties: false,
        },
      },
    },
  });

  const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as Partial<Draft>;
  return {
    variants: (parsed.variants ?? []).map((v) => String(v).trim()).filter(Boolean),
    note: parsed.note?.trim() || null,
    topic: parsed.topic ?? null,
  };
}

/** 모델이 주제어를 지킨 표현을 충분히 못 만들었을 때 쓰는 기본 표현 */
function plainVariants(topic: string[], context: ClientContext): string[] {
  const subject = context.client_type === "business" ? "업체" : "병원";
  const city = cityName(context.region);
  const words = topic.join(" ");
  return [`${city} ${words} ${subject}`.trim(), `${city} ${words} 잘하는 곳 추천`.trim()];
}

export async function generateVariants(keyword: string, context: ClientContext): Promise<KeywordVariants> {
  const original = keyword.replace(/\s+/g, "");
  let topic = topicTokens(keyword, context.region);

  const first = await draft(keyword, context, topic, null);
  // 문장형 질문은 주제어를 기계적으로 못 뽑는다. 모델이 원래 질문에서 그대로 고른 말만 인정한다
  if (topic.length === 0) {
    const picked = literalTopic(first.topic, keyword, context.region);
    if (picked) topic = [picked];
  }

  const keep = (list: string[]) => list.filter((v) => v.replace(/\s+/g, "") !== original && staysOnTopic(v, topic));
  let variants = [...new Set(keep(first.variants))];

  if (variants.length < WANTED && topic.length > 0) {
    const second = await draft(
      keyword,
      context,
      topic,
      `방금 만든 표현 중 주제어(${topic.join(", ")})가 빠진 것이 있었다. 이번에는 빠짐없이 넣는다.`
    );
    variants = [...new Set([...variants, ...keep(second.variants)])];
    if (variants.length < 2) variants = [...new Set([...variants, ...keep(plainVariants(topic, context))])];
  }

  return { variants: variants.slice(0, 4), note: first.note };
}

/**
 * 질문 id → 표현 목록. 표현이 아직 없거나, 저장된 표현 중에 주제를 벗어난 것이 있으면 새로 만들어 저장한다.
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
      continue;
    }
    const topic = topicTokens(keyword.text, context.region);
    if (stored.length > 0 && stored.every((v) => staysOnTopic(v, topic))) {
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
