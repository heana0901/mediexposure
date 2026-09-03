import type { SupabaseClient } from "@supabase/supabase-js";
import { askChatGPT, type AiCallResult } from "./ai/chatgpt";
import { askGemini } from "./ai/gemini";
import { analyzeResponse, type AnalysisResult } from "./analysis";
import { estimateCostUsd } from "./pricing";
import { extractCityFromRegion } from "./location";
import { describeAiError } from "./aiError";
import type { Provider } from "./types";

/**
 * AI 호출 결과. failure가 채워져 있으면 "AI가 언급하지 않았다"가 아니라
 * "물어보지도 못했다"는 뜻입니다. 이 둘을 구분하지 않으면 크레딧이 떨어졌을 때
 * 노출률 0%가 실제 성과처럼 기록됩니다.
 */
type ProviderOutcome = AiCallResult & { failure: string | null };

async function runProvider(
  provider: Provider,
  question: string,
  cityHint: string | null
): Promise<ProviderOutcome> {
  try {
    const result =
      provider === "chatgpt" ? await askChatGPT(question, cityHint) : await askGemini(question);
    return { ...result, failure: null };
  } catch (err) {
    const failure = describeAiError(err, provider);
    console.error(`[monitor] ${provider} 호출 실패`, err);
    return {
      text: `[오류] ${failure}`,
      model: "",
      inputTokens: null,
      outputTokens: null,
      sources: [],
      failure,
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

function emptyAnalysis(): AnalysisResult {
  return {
    mentioned: false,
    rank: null,
    competitors: [],
    model: "",
    inputTokens: null,
    outputTokens: null,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function sumTokens(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

const PROVIDERS: Provider[] = ["chatgpt", "gemini"];

export async function runMonitoringForClient(
  supabase: SupabaseClient,
  client: { id: string; name: string; client_type?: "hospital" | "business"; region?: string | null }
) {
  const clientType = client.client_type ?? "hospital";
  const cityHint = extractCityFromRegion(client.region);
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

  const outcomes = await Promise.all(
    keywords.flatMap((keyword) =>
      PROVIDERS.map(async (provider) => {
        const aiResult = await runProvider(provider, keyword.text, cityHint);
        // 호출 자체가 실패했으면 분석에 돈을 더 쓰지 않습니다.
        const analysis = aiResult.failure
          ? emptyAnalysis()
          : await safeAnalyze(aiResult.text, client.name, clientType);

        const providerCost = estimateCostUsd(
          aiResult.model || null,
          aiResult.inputTokens,
          aiResult.outputTokens
        );
        const analysisCost = estimateCostUsd(analysis.model, analysis.inputTokens, analysis.outputTokens);
        const estimatedCostUsd =
          providerCost === null && analysisCost === null ? null : (providerCost ?? 0) + (analysisCost ?? 0);

        return {
          failure: aiResult.failure,
          row: {
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
          },
        };
      })
    )
  );

  const failures = outcomes.map((o) => o.failure).filter((f): f is string => Boolean(f));

  // 전부 실패했다면 노출률 0%짜리 가짜 기록을 남기지 않고 실행 자체를 되돌립니다.
  if (failures.length === outcomes.length) {
    await supabase.from("monitoring_runs").delete().eq("id", run.id);
    throw new Error(unique(failures).join(" / ") || "AI 호출에 모두 실패했습니다.");
  }

  const { data: insertedResults, error: insertError } = await supabase
    .from("monitoring_results")
    .insert(outcomes.map((o) => o.row))
    .select();

  if (insertError) throw new Error(insertError.message);

  return { run, results: insertedResults, keywords, warnings: unique(failures) };
}
