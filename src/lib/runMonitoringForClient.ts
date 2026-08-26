import type { SupabaseClient } from "@supabase/supabase-js";
import { askChatGPT, type AiCallResult, type AskOptions } from "./ai/chatgpt";
import { askGemini } from "./ai/gemini";
import { buildSearchInstructions, buildSearchQuestion } from "./ai/prompt";
import { analyzeResponse, type AnalysisResult } from "./analysis";
import { estimateCostUsd } from "./pricing";
import { extractLocationHint } from "./location";
import type { Provider } from "./types";

async function runProvider(
  provider: Provider,
  question: string,
  options: AskOptions
): Promise<AiCallResult> {
  try {
    return provider === "chatgpt" ? await askChatGPT(question, options) : await askGemini(question, options);
  } catch (err) {
    return {
      text: `[오류] ${provider} 호출 실패: ${err instanceof Error ? err.message : String(err)}`,
      model: "",
      inputTokens: null,
      outputTokens: null,
      sources: [],
      searched: false,
      searchQueries: [],
    };
  }
}

async function safeAnalyze(
  rawResponse: string,
  clientName: string,
  clientType: "hospital" | "business"
): Promise<AnalysisResult> {
  try {
    return await analyzeResponse(rawResponse, clientName, clientType);
  } catch (err) {
    console.error("analyzeResponse 실패:", err);
    return {
      mentioned: rawResponse.includes(clientName),
      rank: null,
      competitors: [],
      model: process.env.ANALYSIS_MODEL || "gpt-4o-mini",
      inputTokens: null,
      outputTokens: null,
    };
  }
}

function sumTokens(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

const PROVIDERS: Provider[] = ["chatgpt", "gemini"];

/** 012 마이그레이션을 아직 실행하지 않은 DB에 넣을 수 있도록 검색 진단 필드를 뺀다. */
function stripSearchDiagnostics(row: Record<string, unknown>): Record<string, unknown> {
  const legacy = { ...row };
  delete legacy.searched;
  delete legacy.search_queries;
  return legacy;
}

export async function runMonitoringForClient(
  supabase: SupabaseClient,
  client: { id: string; name: string; client_type?: "hospital" | "business"; region?: string | null }
) {
  const clientType = client.client_type ?? "hospital";
  const location = extractLocationHint(client.region);
  const instructions = buildSearchInstructions(clientType);
  const { data: keywords, error: keywordsError } = await supabase
    .from("keywords")
    .select("*")
    .eq("client_id", client.id);

  if (keywordsError) throw new Error(keywordsError.message);
  if (!keywords || keywords.length === 0) return null;

  const { data: run, error: runError } = await supabase
    .from("monitoring_runs")
    .insert({ client_id: client.id })
    .select()
    .single();

  if (runError || !run) throw new Error(runError?.message ?? "실행 생성 실패");

  const resultsToInsert = await Promise.all(
    keywords.flatMap((keyword) =>
      PROVIDERS.map(async (provider) => {
        const question = buildSearchQuestion(keyword.text, clientType, location);
        const aiResult = await runProvider(provider, question, { instructions, location });
        const analysis = await safeAnalyze(aiResult.text, client.name, clientType);

        const providerCost = estimateCostUsd(
          aiResult.model || null,
          aiResult.inputTokens,
          aiResult.outputTokens
        );
        const analysisCost = estimateCostUsd(analysis.model, analysis.inputTokens, analysis.outputTokens);
        const estimatedCostUsd =
          providerCost === null && analysisCost === null ? null : (providerCost ?? 0) + (analysisCost ?? 0);

        return {
          run_id: run.id,
          keyword_id: keyword.id,
          provider,
          mentioned: analysis.mentioned,
          rank: analysis.rank,
          raw_response: aiResult.text,
          competitors: analysis.competitors,
          model: aiResult.model || null,
          input_tokens: sumTokens(aiResult.inputTokens, analysis.inputTokens),
          output_tokens: sumTokens(aiResult.outputTokens, analysis.outputTokens),
          estimated_cost_usd: estimatedCostUsd,
          sources: aiResult.sources,
          searched: aiResult.searched,
          search_queries: aiResult.searchQueries,
        };
      })
    )
  );

  const insertResults = (rows: Record<string, unknown>[]) =>
    supabase.from("monitoring_results").insert(rows).select();

  const firstAttempt = await insertResults(resultsToInsert);

  // 012 마이그레이션 전이면 검색 진단 컬럼이 없다. 모니터링 자체는 계속되도록 빼고 다시 넣는다.
  const needsLegacyInsert = Boolean(
    firstAttempt.error && /searched|search_queries/.test(firstAttempt.error.message)
  );
  if (needsLegacyInsert) {
    console.warn("검색 진단 컬럼이 없어 제외하고 저장합니다. 012 마이그레이션을 실행하세요.");
  }

  const attempt = needsLegacyInsert
    ? await insertResults(resultsToInsert.map(stripSearchDiagnostics))
    : firstAttempt;

  if (attempt.error) throw new Error(attempt.error.message);

  return { run, results: attempt.data, keywords };
}
