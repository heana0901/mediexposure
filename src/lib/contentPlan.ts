import "server-only";
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "./clientResults";
import { competitorFrequency } from "./aggregate";
import { citesDomain, sourceHost } from "./nameMatch";
import { getRecentRunIds } from "./recentUnexposed";
import { selectActiveKeywords } from "./keywords";
import { stripMarkdown } from "./text";
import { estimateCostUsd } from "./pricing";
import { isProvider } from "./providers";
import { checkLocations } from "./locationCheck";
import type { ContentPlan, ContentPrescription, Source } from "./types";

/**
 * 콘텐츠 처방.
 *
 * 검색량이 많은데 AI가 우리 병원을 잘 추천하지 않는 질문부터, 이미 모아 둔 측정 자료로
 * "AI가 대신 누구를 왜 추천했는지 · 무엇을 근거로 읽었는지"를 정리하고,
 * 그 질문에 AI가 우리 병원을 인용하게 만들 홈페이지 페이지 1장을 설계한다.
 * 같은 실행을 근거로 한 처방은 content_plans에 저장해 다시 만들지 않는다.
 */

const PLAN_MODEL = process.env.CONTENT_PLAN_MODEL || "gpt-5.4-mini";
/** 처방 만드는 방식을 바꾸면 올린다. 저장된 처방의 버전이 다르면 새로 만든다 */
const PLAN_VERSION = 5;
/** 한 번에 처방하는 질문 수 */
const MAX_ITEMS = 3;
/** 추천 확률이 이 값 이상인 질문은 처방하지 않는다 */
const GOOD_RATE = 0.6;
/** 검색량을 모르는 질문에 쓰는 가중치 (검색량 있는 질문보다 뒤로 밀린다) */
const UNKNOWN_VOLUME = 50;

/**
 * 의료법 제56조(의료광고 금지)에 걸리기 쉬운 표현:
 * 치료경험담·후기, 치료 전후 사진, 최상급·비교 표현, 완치·무통 같은 보장 표현, 할인·이벤트.
 */
const RISKY = /(후기|경험담|체험기|전\s*[·・/]?\s*후\s*사진|비포\s*애프터|before\s*[&/]?\s*after|최고|최상|최초|유일|1위|넘버\s*원|완치|100\s*%|부작용\s*(이\s*)?없|무통|특가|할인|이벤트)/i;

type ClientLike = {
  id: string;
  name: string;
  client_type?: string | null;
  region?: string | null;
  department?: string | null;
  director_name?: string | null;
  website_url?: string | null;
  aliases?: string[] | null;
};

type Row = {
  run_id: string;
  keyword_id: string | null;
  provider: string;
  mentioned: boolean;
  competitors: string[] | null;
  sources: Source[] | null;
  raw_response: string | null;
  query_text?: string | null;
};

type KeywordRow = { id: string; text: string; search_keyword?: string | null; search_volume?: number | null };

let openai: OpenAI | null = null;
function getClient(): OpenAI {
  openai ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

/**
 * 답변에서 그 병원 이름이 나온 대목 (추천 이유의 근거).
 * "**안산21세기병원**"처럼 이름만 있는 제목 줄이면 이유가 적힌 다음 줄까지 붙인다.
 */
function passagesMentioning(rows: Row[], spellings: string[], limit = 3): string[] {
  const found: string[] = [];
  for (const r of rows) {
    if (!r.raw_response) continue;
    const lines = stripMarkdown(r.raw_response)
      .split(/\n+/)
      .map((line) => line.replace(/^[\s\-•*\d.)]+/, "").trim())
      .filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      if (!spellings.some((name) => lines[i].includes(name))) continue;
      let passage = lines[i];
      for (let j = i + 1; j < lines.length && j <= i + 2 && passage.length < 60; j++) passage += ` ${lines[j]}`;
      const clipped = passage.length > 240 ? `${passage.slice(0, 240)}…` : passage;
      if (!found.includes(clipped)) found.push(clipped);
      if (found.length >= limit) return found;
    }
  }
  return found;
}

/**
 * AI가 근거로 인용한 사이트 (우리 홈페이지 제외). 답변 몇 개가 인용했는지 도메인별로 세고,
 * 실제 주소를 아는 출처(ChatGPT 등)가 있으면 그 페이지를 예시로 붙인다. Gemini 출처는 도메인만 안다.
 */
function citedPages(rows: Row[], websiteUrl: string | null | undefined): ContentPrescription["citedPages"] {
  const pages = new Map<string, ContentPrescription["citedPages"][number]>();
  for (const r of rows) {
    const seen = new Set<string>();
    for (const source of r.sources ?? []) {
      if (citesDomain([source], websiteUrl)) continue;
      const host = sourceHost(source);
      if (!host) continue;
      const entry = pages.get(host) ?? { host, title: null, url: null, count: 0 };
      if (!entry.url && source.url.includes(host)) {
        entry.url = source.url.replace(/[?&]utm_source=openai$/, "");
        entry.title = source.title || null;
      }
      if (!seen.has(host)) {
        seen.add(host);
        entry.count += 1;
      }
      pages.set(host, entry);
    }
  }
  return [...pages.values()].sort((a, b) => b.count - a.count).slice(0, 5);
}

/** 모델이 이유 대신 이름만 되풀이했으면 이유가 없다고 적는다 */
function reasonOrNone(why: string | undefined, name: string): string {
  const text = (why ?? "").trim();
  if (text.length < 6 || text.replace(/\s/g, "") === name.replace(/\s/g, "")) return "답변에 이유가 나오지 않음";
  return text;
}

const SCHEMA = {
  type: "object",
  properties: {
    competitors: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, why: { type: "string" } },
        required: ["name", "why"],
        additionalProperties: false,
      },
    },
    gap: { type: "string" },
    headline: { type: "string" },
    page: {
      type: "object",
      properties: {
        title: { type: "string" },
        slug: { type: "string" },
        summary: { type: "string" },
        faqs: { type: "array", items: { type: "string" } },
        mustHave: { type: "array", items: { type: "string" } },
      },
      required: ["title", "slug", "summary", "faqs", "mustHave"],
      additionalProperties: false,
    },
  },
  required: ["competitors", "gap", "headline", "page"],
  additionalProperties: false,
} as const;

type Drafted = Pick<ContentPrescription, "gap" | "headline" | "page"> & { competitors: { name: string; why: string }[] };

async function draftPrescription(
  client: ClientLike,
  item: {
    question: string;
    searchKeyword: string | null;
    volume: number | null;
    tally: { count: number; total: number };
    competitors: { name: string; count: number; quotes: string[] }[];
    cited: ContentPrescription["citedPages"];
    ownCited: number;
  }
): Promise<{ drafted: Drafted; costUsd: number | null }> {
  const subject = client.client_type === "business" ? "업체" : "병원";
  const facts = [
    `${subject}명: ${client.name}`,
    client.department && `진료과: ${client.department}`,
    client.region && `지역: ${client.region}`,
    client.director_name && `대표원장: ${client.director_name}`,
    client.website_url && `홈페이지: ${client.website_url}`,
  ].filter(Boolean);

  const competitorBlock = item.competitors.length
    ? item.competitors
        .map(
          (c) =>
            `- ${c.name} (${c.count}번 추천)\n${c.quotes.length ? c.quotes.map((q) => `  · "${q}"`).join("\n") : "  · (답변에 이유 문장 없음)"}`
        )
        .join("\n")
    : "- 없음";
  const citedBlock = item.cited.length
    ? item.cited.map((p) => `- ${p.host}${p.title ? ` · ${p.title}` : ""}${p.url ? ` · ${p.url}` : ""} (${p.count}번 인용)`).join("\n")
    : "- 없음";

  const prompt = `${facts.join("\n")}

환자 질문: "${item.question}"
네이버 대표 검색어: ${item.searchKeyword ?? "모름"} · 월간 검색량: ${item.volume === null ? "모름" : `${item.volume.toLocaleString()}회`}
AI가 이 질문에 우리 ${subject}을 추천한 횟수: ${item.tally.total}번 중 ${item.tally.count}번
우리 홈페이지가 출처로 인용된 답변: ${item.ownCited}개

AI가 대신 추천한 곳과, 답변에서 그곳을 언급한 문장:
${competitorBlock}

AI가 답변 근거로 인용한 사이트 (인용한 답변 수):
${citedBlock}

위 자료로 아래를 JSON으로 써라.
- competitors: 대신 추천된 곳마다 AI가 추천한 이유 한 줄. 위 문장에 있는 내용만 쓰고, 문장이 없으면 "답변에 이유가 나오지 않음".
- gap: 우리 ${subject}이 이 질문에서 밀리는 이유 한 줄 (위 자료에 근거해서).
- headline: 마케터가 바로 할 일 한 줄. 예) "'안산 허리디스크' 전용 안내 페이지를 만들고 첫 문단에 전문의 자격과 치료 방법을 넣으세요"
- page.title: 만들 페이지 제목 (질문 핵심어 포함, 40자 이내)
- page.slug: 페이지 주소 (영문 소문자와 -만, 예: /spine/disc-herniation)
- page.summary: 페이지 첫 문단 2~3문장. 질문에 바로 답하는 문장으로 시작하고 ${subject}명과 지역을 넣는다. AI가 그대로 인용하기 좋게 쓴다.
- page.faqs: 환자가 실제로 물을 질문 5개 (질문만)
- page.mustHave: 페이지에 꼭 넣을 사실 4~6개. "대표원장 전문의 자격: {{전문 과목}}"처럼 항목 이름을 쓰고 모르는 값만 {{ }} 빈칸으로 둔다. 병원명·홈페이지 주소처럼 당연한 것은 빼고, 이 질문에 답하는 데 필요한 사실을 고른다.

지킬 것:
- 자료에 없는 ${subject} 정보(장비, 경력, 수술 건수)를 지어내지 않는다.
- 의료법 제56조: 치료 후기·경험담, 치료 전후 사진, 최고·최초·유일·1위 같은 최상급 표현, 다른 병원과 비교, 완치·무통·부작용 없음 같은 보장 표현, 할인·이벤트는 쓰지 않는다.
- 경쟁 ${subject}을 깎아내리는 내용은 쓰지 않는다.`;

  const completion = await getClient().chat.completions.create({
    model: PLAN_MODEL,
    reasoning_effort: "low",
    messages: [
      {
        role: "system",
        content: `너는 ${subject} 마케팅 콘텐츠 기획자다. AI 검색이 환자 질문에 답할 때 이 ${subject}을 근거로 인용하게 만들 홈페이지 페이지를 설계한다. 반드시 JSON으로만 답한다.`,
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_schema", json_schema: { name: "prescription", strict: true, schema: SCHEMA } },
  });

  const drafted = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as Drafted;
  const costUsd = estimateCostUsd(
    PLAN_MODEL,
    completion.usage?.prompt_tokens ?? null,
    completion.usage?.completion_tokens ?? null
  );
  return { drafted, costUsd };
}

/** 의료광고 규정에 걸리기 쉬운 표현을 빼고, 뺀 내용을 알린다 */
function screenRisky(drafted: Drafted): { drafted: Drafted; cautions: string[] } {
  const cautions: string[] = [];
  const keep = (list: string[], label: string) =>
    list.filter((text) => {
      const hit = text.match(RISKY);
      if (hit) cautions.push(`${label}에서 '${hit[0]}' 표현이 든 항목을 뺐습니다.`);
      return !hit;
    });
  const flag = (text: string, label: string) => {
    const hit = text.match(RISKY);
    if (hit) cautions.push(`${label}에 '${hit[0]}' 표현이 있습니다. 의료광고 심의 기준에 맞게 고쳐 쓰세요.`);
  };
  flag(drafted.page.title, "페이지 제목");
  flag(drafted.page.summary, "첫 문단");
  flag(drafted.headline, "처방");
  return {
    drafted: {
      ...drafted,
      page: {
        ...drafted.page,
        faqs: keep(drafted.page.faqs, "FAQ").slice(0, 5),
        // 모델이 빈 빈칸 {{}}을 남기면 무엇을 채울지 알 수 있게 바꾼다
        mustHave: keep(drafted.page.mustHave, "꼭 넣을 정보")
          .map((m) => m.replace(/\{\{\s*\}\}/g, "{{병원에서 채울 내용}}"))
          .slice(0, 6),
      },
    },
    cautions,
  };
}

export async function buildContentPlan(supabase: SupabaseClient, client: ClientLike): Promise<{ plan: ContentPlan; costUsd: number }> {
  const generatedAt = new Date().toISOString();
  const recentRunIds = await getRecentRunIds(supabase, client.id, 3);
  const { data: keywordData } = await selectActiveKeywords(supabase, client.id, "id, text, search_keyword, search_volume");
  const keywords = (keywordData ?? []) as unknown as KeywordRow[];

  const rows = recentRunIds.size
    ? await fetchAllPages<Row>((from, to) =>
        supabase
          .from("monitoring_results")
          .select("id, run_id, keyword_id, provider, mentioned, competitors, sources, raw_response, query_text")
          .in("run_id", [...recentRunIds])
          .not("keyword_id", "is", null)
          .order("id", { ascending: true })
          .range(from, to)
      )
    : [];

  const { data: latestRun } = await supabase
    .from("monitoring_runs")
    .select("id")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const runId = (latestRun?.id as string | undefined) ?? null;

  const candidates = keywords
    .map((k) => {
      const mine = rows.filter((r) => r.keyword_id === k.id && isProvider(r.provider));
      const count = mine.filter((r) => r.mentioned).length;
      return { keyword: k, rows: mine, tally: { count, total: mine.length } };
    })
    .filter((c) => c.tally.total > 0 && c.tally.count / c.tally.total < GOOD_RATE)
    .sort((a, b) => {
      const score = (c: typeof a) => (c.keyword.search_volume ?? UNKNOWN_VOLUME) * (1 - c.tally.count / c.tally.total);
      return score(b) - score(a);
    })
    .slice(0, MAX_ITEMS);

  // AI가 잘못 알고 있는 우리 병원 위치 (처방과 함께 저장해 화면·리포트가 같이 쓴다)
  const locationCheck = await checkLocations(client, rows).catch((err) => {
    console.error("[contentPlan] 위치 확인 실패", err);
    return null;
  });

  if (candidates.length === 0) {
    const note = rows.length
      ? `최근 측정에서 모든 질문의 AI 추천 확률이 ${GOOD_RATE * 100}% 이상입니다. 지금 콘텐츠를 유지하세요.`
      : "아직 측정 결과가 없어 처방을 만들 수 없습니다.";
    return { plan: { version: PLAN_VERSION, generatedAt, runId, items: [], note, locationCheck }, costUsd: 0 };
  }

  let costUsd = 0;
  const items = await Promise.all(
    candidates.map(async ({ keyword, rows: mine, tally }): Promise<ContentPrescription> => {
      const lost = mine.filter((r) => !r.mentioned);
      const rivals = competitorFrequency(lost, { name: client.name, aliases: client.aliases ?? [] })
        .slice(0, 3)
        .map((c) => ({ name: c.name, count: c.total, quotes: passagesMentioning(lost, c.spellings ?? [c.name]) }));
      const cited = citedPages(mine, client.website_url);
      const ownCited = mine.filter((r) => citesDomain(r.sources ?? [], client.website_url)).length;

      const { drafted, costUsd: cost } = await draftPrescription(client, {
        question: keyword.text,
        searchKeyword: keyword.search_keyword ?? null,
        volume: keyword.search_volume ?? null,
        tally,
        competitors: rivals,
        cited,
        ownCited,
      });
      costUsd += cost ?? 0;
      const screened = screenRisky(drafted);

      return {
        keywordId: keyword.id,
        question: keyword.text,
        searchKeyword: keyword.search_keyword ?? null,
        volume: keyword.search_volume ?? null,
        tally,
        competitors: rivals.map((r) => ({
          name: r.name,
          count: r.count,
          why: reasonOrNone(screened.drafted.competitors.find((c) => c.name === r.name)?.why, r.name),
        })),
        citedPages: cited,
        ownCited,
        gap: screened.drafted.gap,
        headline: screened.drafted.headline,
        page: screened.drafted.page,
        cautions: screened.cautions,
      };
    })
  );

  return { plan: { version: PLAN_VERSION, generatedAt, runId, items, note: null, locationCheck }, costUsd };
}

/**
 * 가장 최근 실행을 근거로 한 처방. 저장된 처방이 최근 실행보다 오래됐으면
 * generate가 true일 때만 새로 만든다 (자동 실행 중 리포트 발송처럼 시간이 빠듯할 때는 false).
 */
export async function getContentPlan(
  supabase: SupabaseClient,
  client: ClientLike,
  { generate }: { generate: boolean }
): Promise<ContentPlan | null> {
  const [{ data: latestRun }, cachedQuery] = await Promise.all([
    supabase.from("monitoring_runs").select("id").eq("client_id", client.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase
      .from("content_plans")
      .select("run_id, plan")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  // 019 이전 DB(content_plans 없음)에서는 저장 없이 만들기만 한다
  const tableMissing = Boolean(cachedQuery.error);
  const cached = cachedQuery.data as { run_id: string | null; plan: ContentPlan } | null;
  const latestRunId = (latestRun?.id as string | undefined) ?? null;

  if (cached && cached.run_id === latestRunId && cached.plan.version === PLAN_VERSION) return cached.plan;
  if (!generate || !latestRunId) return cached?.plan ?? null;

  const { plan, costUsd } = await buildContentPlan(supabase, client);
  if (!tableMissing) {
    const { error } = await supabase
      .from("content_plans")
      .insert({ client_id: client.id, run_id: plan.runId, plan, cost_usd: costUsd });
    if (error) console.error("[contentPlan] 저장 실패", error.message);
  }
  return plan;
}
