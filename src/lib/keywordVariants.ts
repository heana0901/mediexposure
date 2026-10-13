import "server-only";
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { keepsRegion, literalTopic, regionRule, staysOnTopic, topicTokens, type RegionRule } from "./keywordTopic";

/**
 * 질문 하나를 환자가 실제로 칠 법한 여러 표현으로 늘린다.
 *
 * 같은 의도라도 "고양시 이명 병원" · "이명이 계속되는데 고양시 어디 병원 가야 해요?"처럼
 * 표현이 바뀌면 AI 답이 달라진다. 표현 하나의 운에 숫자가 좌우되지 않도록, 반복 측정할 때
 * 회차마다 다른 표현으로 묻는다. 원래 질문은 항상 첫 번째로 쓴다.
 *
 * 표현을 바꾸다 질문이 달라지면 다른 것을 재게 되므로 두 가지를 기계적으로 확인하고, 어긴 표현은 버린다.
 * - 주제: 핵심 주제어(질환·시술·진료과)가 글자 그대로 들어 있어야 한다.
 * - 지역: 원래 질문과 같은 지역 범위여야 하고, 병원 주소(도로명)를 넣으면 안 된다.
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

async function draft(
  keyword: string,
  context: ClientContext,
  topic: string[],
  region: RegionRule,
  retryNote: string | null
): Promise<Draft> {
  const subject = context.client_type === "business" ? "업체" : "병원";
  const topicLine = topic.length
    ? `핵심 주제어: ${topic.map((t) => `"${t}"`).join(", ")}`
    : "핵심 주제어: 원래 질문에서 질환·시술·진료과 이름을 글자 그대로 골라 topic에 적는다 (없으면 null)";
  // 병원 주소는 넘기지 않는다. 넘기면 모델이 도로명·번지를 질문에 넣는다
  const placeLine = region.place
    ? `지역 표기: "${region.place}" (지역은 이 표기로만 쓴다. 더 좁은 구·동이나 도로명·번지, 더 넓은 도 이름은 쓰지 않는다)`
    : "지역 표기: 원래 질문에 있는 지역만 쓴다 (없으면 지역을 넣지 않는다)";

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
${placeLine}
진료과/업종: ${context.department ?? "알 수 없음"} (참고용)

같은 것을 묻는 다른 표현 ${WANTED}개를 만들어라.
- 모든 표현에 핵심 주제어를 글자 그대로, 한 번만 넣는다. 다른 질환·증상·시술·진료과로 바꾸지 않는다.
  나쁜 예: 원래 질문이 "디스크내장증"인데 "목이 아픈데 신경외과 어디 가야 해?" (주제어가 사라져 다른 질문이 됨)
- 1개는 고민을 말하는 자연스러운 문장형
  (예: 질환이면 "허리디스크 진단받았는데 안산에서 어느 병원으로 가야 할까요?", 시술이면 "척추내시경 수술 받으려는데 안산에 잘하는 병원 있나요?", 진료과면 "안산에 정형외과 괜찮은 곳 어디 있나요?")
- 1개는 지역 + 추천 요청형 (예: "안산 허리디스크 잘 보는 병원 추천")
- 1개는 짧은 검색어형 (예: "안산 허리디스크 병원")
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

/** 주제어가 한 표현에 두 번 이상 나오면 "디스크내장증 같은데 디스크내장증인가요?" 같은 어색한 문장이다 */
function repeatsTopic(variant: string, topic: string[]): boolean {
  const compact = variant.replace(/\s+/g, "");
  return topic.some((t) => compact.split(t).length > 2);
}

/** 표현이 원래 질문과 같은 질문인지: 주제어가 그대로 있고, 지역 범위를 지킨다 */
function sameQuestion(variant: string, topic: string[], region: RegionRule): boolean {
  return staysOnTopic(variant, topic) && keepsRegion(variant, region);
}

/** 모델이 규칙을 지킨 표현을 충분히 못 만들었을 때 쓰는 기본 표현 */
function plainVariants(topic: string[], region: RegionRule, context: ClientContext): string[] {
  const subject = context.client_type === "business" ? "업체" : "병원";
  const words = topic.join(" ");
  return [`${region.place} ${words} ${subject}`.trim(), `${region.place} ${words} 잘하는 곳 추천`.trim()];
}

export async function generateVariants(keyword: string, context: ClientContext): Promise<KeywordVariants> {
  const original = keyword.replace(/\s+/g, "");
  const region = regionRule(keyword, context.region);
  let topic = topicTokens(keyword, context.region);

  const first = await draft(keyword, context, topic, region, null);
  // 문장형 질문은 주제어를 기계적으로 못 뽑는다. 모델이 원래 질문에서 그대로 고른 말만 인정한다
  if (topic.length === 0) {
    const picked = literalTopic(first.topic, keyword, context.region);
    if (picked) topic = [picked];
  }

  const keep = (list: string[]) =>
    list.filter((v) => v.replace(/\s+/g, "") !== original && sameQuestion(v, topic, region) && !repeatsTopic(v, topic));
  let variants = [...new Set(keep(first.variants))];

  if (variants.length < WANTED) {
    const second = await draft(
      keyword,
      context,
      topic,
      region,
      "방금 만든 표현 중 규칙을 어긴 것이 있었다(주제어가 빠졌거나 두 번 들어감, 또는 허용되지 않은 지역·주소 표기). 이번에는 규칙을 모두 지킨다."
    );
    variants = [...new Set([...variants, ...keep(second.variants)])];
    if (variants.length < 2 && topic.length > 0) variants = [...new Set([...variants, ...keep(plainVariants(topic, region, context))])];
  }

  return { variants: variants.slice(0, 4), note: first.note };
}

/**
 * 질문 id → 표현 목록. 표현이 아직 없거나, 저장된 표현 중에 주제나 지역 범위를 벗어난 것이 있으면 새로 만들어 저장한다.
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
    const region = regionRule(keyword.text, context.region);
    if (stored.length > 0 && stored.every((v) => sameQuestion(v, topic, region))) {
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
