import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiCallResult, AskOptions } from "./ai/types";
import { askProvider, getActiveProviders, getConcurrency, getMaxSampleCount, getSampleCount } from "./ai/registry";
import { buildNaturalContext, buildSearchInstructions, buildSearchQuestion, getQueryMode } from "./ai/prompt";
import { analyzeResponse, type AnalysisResult } from "./analysis";
import { estimateCostUsd } from "./pricing";
import { extractLocationHint } from "./location";
import { describeAiError } from "./aiError";
import { selectActiveKeywords } from "./keywords";
import { ensureVariants } from "./keywordVariants";
import { judgeResponse } from "./nameMatch";
import { recordNaver } from "./naver/record";
import { getContentPlan } from "./contentPlan";
import { PROVIDER_META, type Provider } from "./providers";

/**
 * AI 호출 결과. failure가 채워져 있으면 "AI가 언급하지 않았다"가 아니라
 * "물어보지도 못했다"는 뜻이다. 이 둘을 구분하지 않으면 크레딧이 떨어졌을 때
 * 노출률 0%가 실제 성과처럼 기록된다. 그래서 실패한 호출은 결과로 저장하지 않는다.
 */
type ProviderOutcome = AiCallResult & { failure: string | null };

async function runProvider(provider: Provider, question: string, options: AskOptions): Promise<ProviderOutcome> {
  try {
    const result = await askProvider(provider)(question, options);
    return { ...result, failure: null };
  } catch (err) {
    const failure = describeAiError(err, provider);
    console.error(`[monitor] ${provider} 호출 실패`, err);
    return {
      text: "",
      model: "",
      inputTokens: null,
      outputTokens: null,
      sources: [],
      searched: false,
      searchQueries: [],
      searchCount: 0,
      failure,
    };
  }
}

async function safeAnalyze(
  rawResponse: string,
  clientName: string,
  clientType: "hospital" | "business",
  aliases: string[]
): Promise<AnalysisResult> {
  try {
    return await analyzeResponse(rawResponse, clientName, clientType, aliases);
  } catch (err) {
    // 경쟁 병원 추출만 못 했을 뿐, 노출 여부·순위·근거는 원문으로 그대로 판정할 수 있다
    console.error("analyzeResponse 실패:", err);
    return {
      ...judgeResponse(rawResponse, clientName, aliases, []),
      model: process.env.ANALYSIS_MODEL || "gpt-4o-mini",
      inputTokens: null,
      outputTokens: null,
    };
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function sumTokens(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

/** 동시에 실행되는 작업 수를 제한한다. 자리가 나면 대기열 맨 앞 작업에 바로 넘긴다. */
function createLimiter(concurrency: number) {
  let active = 0;
  const queue: (() => void)[] = [];

  const release = () => {
    const resume = queue.shift();
    if (resume) resume();
    else active--;
  };

  return async function limit<T>(task: () => Promise<T>): Promise<T> {
    if (active < concurrency) active++;
    else await new Promise<void>((resolve) => queue.push(resolve));
    try {
      return await task();
    } finally {
      release();
    }
  };
}

/**
 * 마이그레이션을 아직 실행하지 않은 DB에도 저장할 수 있게 두는 안전장치.
 * 012는 searched·search_queries, 013은 keyword_text, 014는 sample_index, 016은 evidence·query_text를 추가했다.
 * 컬럼이 없다는 오류가 나면 그 컬럼만 빼고 다시 넣는다.
 */
const OPTIONAL_COLUMNS = ["searched", "search_queries", "keyword_text", "sample_index", "evidence", "query_text"] as const;

/** 014 이전 DB는 provider 값으로 chatgpt·gemini만 받는다 */
const LEGACY_PROVIDERS = ["chatgpt", "gemini"];

function missingColumnsFrom(message: string): string[] {
  return OPTIONAL_COLUMNS.filter((column) => message.includes(column));
}

function isProviderCheckViolation(message: string): boolean {
  return message.includes("monitoring_results_provider_check");
}

function stripColumns(row: Record<string, unknown>, columns: string[]): Record<string, unknown> {
  const legacy = { ...row };
  for (const column of columns) delete legacy[column];
  return legacy;
}

export type RunMonitoringOptions = {
  /**
   * 이 시각(ms) 이후에는 새 AI 호출을 시작하지 않는다. 서버 함수 실행 시간 한도에 걸려
   * 그때까지 받은 답변까지 통째로 잃는 일을 막는다. 이미 시작한 호출은 끝까지 기다린다.
   */
  deadline?: number;
};

type ClientForMonitoring = {
  id: string;
  name: string;
  client_type?: "hospital" | "business";
  region?: string | null;
  department?: string | null;
  aliases?: unknown;
  website_url?: string | null;
  naver_blog_url?: string | null;
};

function aliasesOf(client: ClientForMonitoring): string[] {
  return Array.isArray(client.aliases) ? client.aliases.filter((a): a is string => typeof a === "string") : [];
}

export async function runMonitoringForClient(
  supabase: SupabaseClient,
  client: ClientForMonitoring,
  { deadline }: RunMonitoringOptions = {}
) {
  const clientType = client.client_type ?? "hospital";
  const aliases = aliasesOf(client);
  const location = extractLocationHint(client.region);
  const queryMode = getQueryMode();
  const instructions =
    queryMode === "list" ? buildSearchInstructions(clientType) : buildNaturalContext(location);
  const providers = getActiveProviders();
  const samples = getSampleCount();
  const maxSamples = Math.max(samples, getMaxSampleCount());
  const { data: keywords, error: keywordsError } = await selectActiveKeywords(supabase, client.id);

  if (keywordsError) throw new Error(keywordsError.message);
  if (!keywords || keywords.length === 0) return null;
  if (providers.length === 0) {
    throw new Error("모니터링할 AI가 없습니다. OPENAI_API_KEY 등 AI API 키 환경변수를 확인하세요.");
  }

  // 질문마다 환자가 칠 법한 다른 표현들. 회차마다 돌려 가며 묻는다(원래 질문이 항상 1회차).
  const variantsById =
    samples > 1 ? await ensureVariants(supabase, keywords, client) : new Map<string, string[]>();
  const phrasingFor = (keyword: { id: string; text: string }, sampleIndex: number) => {
    const phrasings = [keyword.text, ...(variantsById.get(keyword.id) ?? [])];
    return phrasings[sampleIndex % phrasings.length];
  };

  // 측정 조건을 실행 기록에 남긴다(016 전이면 조건 없이 만든다)
  let runInsert = await supabase
    .from("monitoring_runs")
    .insert({ client_id: client.id, query_mode: queryMode, samples })
    .select()
    .single();
  if (runInsert.error && /query_mode|samples/.test(runInsert.error.message)) {
    runInsert = await supabase.from("monitoring_runs").insert({ client_id: client.id }).select().single();
  }
  const { data: run, error: runError } = runInsert;

  if (runError || !run) throw new Error(runError?.message ?? "실행 생성 실패");

  const concurrency = getConcurrency();
  const limiters = new Map(providers.map((p) => [p, createLimiter(concurrency)]));
  let skippedForTime = 0;

  type Task = { keyword: (typeof keywords)[number]; provider: Provider; sampleIndex: number };
  type Outcome = { failure: string | null; row: Record<string, unknown> | null; task: Task } | null;

  const runTask = (task: Task): Promise<Outcome> =>
    limiters.get(task.provider)!(async () => {
      if (deadline !== undefined && Date.now() > deadline) {
        skippedForTime += 1;
        return null;
      }

      const { keyword, provider, sampleIndex } = task;
      const phrasing = phrasingFor(keyword, sampleIndex);
      // 자연 질문 모드는 사람이 검색창에 치는 문장을 그대로 보낸다
      const question = queryMode === "list" ? buildSearchQuestion(phrasing, clientType, location) : phrasing;
      const aiResult = await runProvider(provider, question, { instructions, location });
      if (aiResult.failure) return { failure: aiResult.failure, row: null, task };

      const analysis = await safeAnalyze(aiResult.text, client.name, clientType, aliases);
      const providerCost =
        aiResult.costUsd ??
        estimateCostUsd(aiResult.model || null, aiResult.inputTokens, aiResult.outputTokens, aiResult.searchCount);
      const analysisCost = estimateCostUsd(analysis.model, analysis.inputTokens, analysis.outputTokens);
      const estimatedCostUsd =
        providerCost === null && analysisCost === null ? null : (providerCost ?? 0) + (analysisCost ?? 0);

      return {
        failure: null,
        task,
        row: {
          run_id: run.id,
          keyword_id: keyword.id,
          // 질문이 나중에 지워져도 무엇을 물어본 결과인지 남기기 위한 사본
          keyword_text: keyword.text,
          // 이 회차에 실제로 보낸 표현
          query_text: phrasing,
          provider,
          sample_index: sampleIndex,
          mentioned: analysis.mentioned,
          rank: analysis.rank,
          evidence: analysis.evidence,
          raw_response: aiResult.text,
          competitors: analysis.competitors,
          model: aiResult.model || null,
          input_tokens: sumTokens(aiResult.inputTokens, analysis.inputTokens),
          output_tokens: sumTokens(aiResult.outputTokens, analysis.outputTokens),
          estimated_cost_usd: estimatedCostUsd,
          sources: aiResult.sources,
          searched: aiResult.searched,
          search_queries: aiResult.searchQueries,
        },
      };
    });

  // 회차(sample) 순서로 줄 세운다. 시간이 모자라 뒤쪽이 잘려도 모든 질문이 최소 한 번은 측정되게 하기 위해서다.
  const firstWave = Array.from({ length: samples }, (_, sampleIndex) =>
    keywords.flatMap((keyword) => providers.map((provider) => ({ keyword, provider, sampleIndex })))
  ).flat();
  const outcomes: Outcome[] = await Promise.all(firstWave.map(runTask));

  // 결과가 갈린 질문(예: 3회 중 1~2회 노출)만 더 물어 확률을 좁힌다. 모두 노출/모두 미노출이면 그대로 둔다.
  if (maxSamples > samples) {
    const groups = new Map<string, { task: Task; hits: number; total: number }>();
    for (const o of outcomes) {
      if (!o?.row) continue;
      const key = `${o.task.keyword.id}|${o.task.provider}`;
      const g = groups.get(key) ?? { task: o.task, hits: 0, total: 0 };
      g.total += 1;
      if (o.row.mentioned) g.hits += 1;
      groups.set(key, g);
    }
    const extra: Task[] = [];
    for (const g of groups.values()) {
      if (g.hits === 0 || g.hits === g.total) continue;
      for (let sampleIndex = samples; sampleIndex < maxSamples; sampleIndex++) {
        extra.push({ keyword: g.task.keyword, provider: g.task.provider, sampleIndex });
      }
    }
    outcomes.push(...(await Promise.all(extra.map(runTask))));
  }

  const attempted = outcomes.filter((o): o is NonNullable<typeof o> => o !== null);
  const failures = attempted.map((o) => o.failure).filter((f): f is string => Boolean(f));
  let rows = attempted.map((o) => o.row).filter((r): r is Record<string, unknown> => r !== null);

  // 하나도 못 받았다면 노출률 0%짜리 가짜 기록을 남기지 않고 실행 자체를 되돌린다.
  if (rows.length === 0) {
    await supabase.from("monitoring_runs").delete().eq("id", run.id);
    const reasons = unique(failures);
    if (skippedForTime > 0) reasons.push("실행 시간 한도에 걸려 AI에 묻지 못했습니다.");
    throw new Error(reasons.join(" / ") || "AI 호출에 모두 실패했습니다.");
  }

  const warnings = unique(failures);
  if (skippedForTime > 0) {
    warnings.push(
      `실행 시간 한도 때문에 ${skippedForTime}건은 묻지 못했습니다. 질문 수를 줄이거나 MONITOR_SAMPLES를 낮춰 주세요.`
    );
  }

  const insertResults = (toInsert: Record<string, unknown>[]) =>
    supabase.from("monitoring_results").insert(toInsert).select();

  // 아직 실행하지 않은 마이그레이션이 있으면 저장할 수 있는 만큼만 맞춰서 다시 넣는다.
  //  - 없는 컬럼은 그 컬럼만 뺀다 (012~014)
  //  - 014 전이면 provider 제약이 chatgpt·gemini만 받으므로 새로 붙인 AI 결과는 뺀다
  const stripped: string[] = [];
  let attempt = await insertResults(rows);

  for (let retry = 0; attempt.error && retry < OPTIONAL_COLUMNS.length + 1; retry++) {
    const message = attempt.error.message;
    const missing = missingColumnsFrom(message).filter((c) => !stripped.includes(c));

    if (missing.length) {
      stripped.push(...missing);
      console.warn(`${missing.join(", ")} 컬럼이 없어 제외하고 저장합니다. 012~014 마이그레이션을 실행하세요.`);
    } else if (isProviderCheckViolation(message)) {
      const dropped = unique(rows.map((r) => String(r.provider)).filter((p) => !LEGACY_PROVIDERS.includes(p)));
      if (dropped.length === 0) break;
      rows = rows.filter((r) => LEGACY_PROVIDERS.includes(String(r.provider)));
      warnings.push(
        `${dropped.map((p) => PROVIDER_META[p as Provider]?.label ?? p).join("·")} 결과를 저장하려면 014 마이그레이션을 실행하세요.`
      );
      if (rows.length === 0) break;
    } else {
      break;
    }

    attempt = await insertResults(rows.map((row) => stripColumns(row, stripped)));
  }

  if (rows.length === 0) {
    await supabase.from("monitoring_runs").delete().eq("id", run.id);
    throw new Error(warnings.join(" / "));
  }

  if (attempt.error) {
    await supabase.from("monitoring_runs").delete().eq("id", run.id);
    throw new Error(attempt.error.message);
  }

  // 같은 질문으로 네이버 쪽(검색량·플레이스·블로그·웹문서)도 함께 기록한다
  warnings.push(...(await recordNaver(supabase, run.id, keywords, client)));

  // 이번 실행을 근거로 콘텐츠 처방(리포트에 들어감)을 새로 만든다.
  // 자동 실행 시간이 빠듯하면 건너뛰고, 다음에 화면이나 리포트를 열 때 만든다.
  if (deadline === undefined || Date.now() < deadline - 20_000) {
    try {
      await getContentPlan(supabase, { ...client, aliases }, { generate: true });
    } catch (err) {
      warnings.push(`콘텐츠 처방을 만들지 못했습니다: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { run, results: attempt.data, keywords, providers, samples, queryMode, warnings };
}
