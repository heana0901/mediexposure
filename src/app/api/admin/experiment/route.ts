import { NextResponse } from "next/server";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { getSupabaseServerClient } from "@/lib/supabase";
import { verifySession } from "@/lib/dal";
import { askChatGPT } from "@/lib/ai/chatgpt";
import { askGemini } from "@/lib/ai/gemini";
import type { AiCallResult, AskOptions } from "@/lib/ai/types";
import { buildNaturalContext } from "@/lib/ai/prompt";
import { extractLocationHint } from "@/lib/location";
import { selectActiveKeywords } from "@/lib/keywords";
import { ensureVariants } from "@/lib/keywordVariants";
import { judgeResponse } from "@/lib/nameMatch";
import { estimateCostUsd } from "@/lib/pricing";
import { searchPlaces } from "@/lib/naver/searchApi";

export const maxDuration = 300;

/**
 * 측정 조건 비교 실험. 관리자 전용.
 * 같은 질문을 모델·검색 방식·위치 조건만 바꿔 물어보고 노출 횟수를 비교한다.
 * 모니터링 기록에는 저장하지 않으므로 추이 그래프와 리포트에 섞이지 않는다.
 */

type Config = {
  label: string;
  provider: "chatgpt" | "gemini";
  model?: string;
  forceSearch?: boolean;
  withLocation: boolean;
  maps?: boolean;
};

const CONFIGS: Record<string, Config> = {
  "gpt-current": { label: "ChatGPT 지금 설정 (기본 모델·검색 강제·위치)", provider: "chatgpt", withLocation: true },
  "gpt-noloc": { label: "ChatGPT 지금 설정에서 위치만 뺌", provider: "chatgpt", withLocation: false },
  "gpt-big-forced": {
    label: "ChatGPT 상위 모델·검색 강제",
    provider: "chatgpt",
    model: "gpt-5.5",
    withLocation: true,
  },
  "gpt-big-auto": {
    label: "ChatGPT 상위 모델·검색은 모델이 판단 (앱과 가까운 조건)",
    provider: "chatgpt",
    model: "gpt-5.5",
    forceSearch: false,
    withLocation: true,
  },
  "gemini-current": { label: "Gemini 지금 설정 (기본 모델·구글 검색)", provider: "gemini", withLocation: true },
  "gemini-pro": { label: "Gemini 상위 모델·구글 검색", provider: "gemini", model: "gemini-3.8-pro", withLocation: true },
  "gemini-maps": {
    label: "Gemini 지금 설정 + 구글 지도",
    provider: "gemini",
    withLocation: true,
    maps: true,
  },
};

/** 새 호출을 시작하지 않는 시점. 함수 시간 한도 전에 받은 결과라도 돌려준다. */
const BUDGET_MS = 240_000;

async function ask(config: Config, question: string, options: AskOptions): Promise<AiCallResult> {
  return config.provider === "chatgpt" ? askChatGPT(question, options) : askGemini(question, options);
}

function createLimiter(concurrency: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async <T,>(fn: () => Promise<T>): Promise<T> => {
    if (active >= concurrency) await new Promise<void>((r) => queue.push(r));
    active += 1;
    try {
      return await fn();
    } finally {
      active -= 1;
      queue.shift()?.();
    }
  };
}

async function requireAdmin() {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!session.isAdmin) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  return null;
}

/** 실험 조건 목록과, 지금 키로 쓸 수 있는 모델 이름 */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const models: { openai: string[]; gemini: string[]; errors: string[] } = { openai: [], gemini: [], errors: [] };
  try {
    const list = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).models.list();
    for await (const m of list) if (/^gpt-5|^o\d/.test(m.id)) models.openai.push(m.id);
  } catch (err) {
    models.errors.push(`OpenAI: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    const pager = await new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }).models.list();
    for await (const m of pager) {
      const name = (m.name ?? "").replace(/^models\//, "");
      if (/^gemini-/.test(name)) models.gemini.push(name);
    }
  } catch (err) {
    models.errors.push(`Gemini: ${err instanceof Error ? err.message : String(err)}`);
  }
  models.openai.sort();
  models.gemini.sort();

  return NextResponse.json({
    configs: Object.entries(CONFIGS).map(([key, c]) => ({ key, ...c })),
    defaults: { openai: process.env.OPENAI_MODEL || "gpt-5.4-mini", gemini: process.env.GEMINI_MODEL || "gemini-3.8-flash" },
    models,
  });
}

/** body: { clientId, config, samples?: 1~5, model?: 조건의 모델을 바꿔 볼 때 } */
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const startedAt = Date.now();
  const body = await request.json().catch(() => ({}));
  const config = CONFIGS[body.config as string];
  if (!config) return NextResponse.json({ error: `config는 ${Object.keys(CONFIGS).join(", ")} 중 하나` }, { status: 400 });
  const samples = Math.min(5, Math.max(1, Math.round(Number(body.samples ?? 3)) || 3));
  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : config.model;

  const supabase = getSupabaseServerClient();
  const { data: client, error } = await supabase.from("clients").select("*").eq("id", body.clientId).single();
  if (error || !client) return NextResponse.json({ error: error?.message ?? "병원을 찾을 수 없습니다." }, { status: 404 });

  const { data: keywords, error: kwError } = await selectActiveKeywords(supabase, client.id);
  if (kwError) return NextResponse.json({ error: kwError.message }, { status: 500 });
  if (!keywords?.length) return NextResponse.json({ error: "활성 질문이 없습니다." }, { status: 400 });

  const variants = samples > 1 ? await ensureVariants(supabase, keywords, client) : new Map<string, string[]>();
  const aliases: string[] = Array.isArray(client.aliases) ? client.aliases.filter((a: unknown) => typeof a === "string") : [];
  const location = config.withLocation ? extractLocationHint(client.region) : null;

  // 지도 그라운딩에 넘길 좌표: 병원 근처에서 검색하는 환자를 가정한다
  let maps: AskOptions["maps"] = null;
  if (config.maps) {
    const place = (await searchPlaces(client.name, 5).catch(() => [])).find((p) => p.lat !== null && p.lng !== null);
    if (place) maps = { latitude: place.lat!, longitude: place.lng! };
  }

  const options: AskOptions = {
    instructions: buildNaturalContext(location),
    location,
    model,
    forceSearch: config.forceSearch,
    maps,
  };

  const limit = createLimiter(6);
  let skipped = 0;
  const tasks = Array.from({ length: samples }, (_, sampleIndex) => keywords.map((k) => ({ k, sampleIndex }))).flat();

  const results = await Promise.all(
    tasks.map(({ k, sampleIndex }) =>
      limit(async () => {
        if (Date.now() - startedAt > BUDGET_MS) {
          skipped += 1;
          return null;
        }
        const phrasings = [k.text, ...(variants.get(k.id) ?? [])];
        const phrasing = phrasings[sampleIndex % phrasings.length];
        const t0 = Date.now();
        try {
          const r = await ask(config, phrasing, options);
          const j = judgeResponse(r.text, client.name, aliases, []);
          return {
            keyword: k.text,
            phrasing,
            sampleIndex,
            mentioned: j.mentioned,
            rank: j.rank,
            evidence: j.evidence?.slice(0, 160) ?? null,
            model: r.model,
            searched: r.searched,
            searchCount: r.searchCount,
            searchQueries: r.searchQueries.slice(0, 4),
            sources: r.sources.slice(0, 8).map((s) => s.url),
            answer: r.text.slice(0, 600),
            costUsd: r.costUsd ?? estimateCostUsd(r.model, r.inputTokens, r.outputTokens, r.searchCount),
            ms: Date.now() - t0,
            error: null as string | null,
          };
        } catch (err) {
          return {
            keyword: k.text,
            phrasing,
            sampleIndex,
            mentioned: false,
            rank: null,
            evidence: null,
            model: model ?? "",
            searched: false,
            searchCount: 0,
            searchQueries: [],
            sources: [],
            answer: "",
            costUsd: null,
            ms: Date.now() - t0,
            error: err instanceof Error ? err.message.slice(0, 300) : String(err),
          };
        }
      })
    )
  );

  const done = results.filter((r): r is NonNullable<typeof r> => r !== null);
  const ok = done.filter((r) => !r.error);
  const byKeyword = keywords.map((k) => {
    const rows = ok.filter((r) => r.keyword === k.text);
    return { keyword: k.text, hits: rows.filter((r) => r.mentioned).length, total: rows.length };
  });

  return NextResponse.json({
    config: body.config,
    label: config.label,
    model: ok[0]?.model ?? model ?? null,
    location: location ? [location.region, location.city].filter(Boolean).join(" ") : null,
    maps,
    samples,
    summary: {
      hits: ok.filter((r) => r.mentioned).length,
      total: ok.length,
      errors: done.length - ok.length,
      skippedForTime: skipped,
      searchedRate: ok.length ? ok.filter((r) => r.searched).length / ok.length : null,
      costUsd: ok.reduce((sum, r) => sum + (r.costUsd ?? 0), 0),
      elapsedMs: Date.now() - startedAt,
    },
    byKeyword,
    results: done,
  });
}
