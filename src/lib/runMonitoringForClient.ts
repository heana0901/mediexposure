import type { SupabaseClient } from "@supabase/supabase-js";
import { askChatGPT, type AiCallResult } from "./ai/chatgpt";
import { askGemini } from "./ai/gemini";
import { analyzeResponse, type AnalysisResult } from "./analysis";
import { estimateCostUsd } from "./pricing";
import type { Provider } from "./types";

async function runProvider(provider: Provider, question: string): Promise<AiCallResult> {
  try {
    return provider === "chatgpt" ? await askChatGPT(question) : await askGemini(question);
  } catch (err) {
    return {
      text: `[오류] ${provider} 호출 실패: ${err instanceof Error ? err.message : String(err)}`,
      model: "",
      inputTokens: null,
      outputTokens: null,
      sources: [],
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

export async function runMonitoringForClient(
  supabase: SupabaseClient,
  client: { id: string; name: string; client_type?: "hospital" | "business" }
) {
  const clientType = client.client_type ?? "hospital";
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
        const aiResult = await runProvider(provider, keyword.text);
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
        };
      })
    )
  );

  const { data: insertedResults, error: insertError } = await supabase
    .from("monitoring_results")
    .insert(resultsToInsert)
    .select();

  if (insertError) throw new Error(insertError.message);

  return { run, results: insertedResults, keywords };
}
