import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { askChatGPT } from "@/lib/ai/chatgpt";
import { askGemini } from "@/lib/ai/gemini";
import { analyzeResponse, type AnalysisResult } from "@/lib/analysis";
import type { Provider } from "@/lib/types";

async function runProvider(
  provider: Provider,
  question: string
): Promise<string> {
  try {
    return provider === "chatgpt" ? await askChatGPT(question) : await askGemini(question);
  } catch (err) {
    return `[오류] ${provider} 호출 실패: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function safeAnalyze(rawResponse: string, clientName: string): Promise<AnalysisResult> {
  try {
    return await analyzeResponse(rawResponse, clientName);
  } catch (err) {
    console.error("analyzeResponse 실패:", err);
    return {
      mentioned: rawResponse.includes(clientName),
      rank: null,
      competitors: [],
    };
  }
}

export async function POST(request: Request) {
  const { clientId } = await request.json();
  if (!clientId) {
    return NextResponse.json({ error: "clientId가 필요합니다." }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .single();

  if (clientError || !client) {
    return NextResponse.json({ error: "클라이언트를 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: keywords, error: keywordsError } = await supabase
    .from("keywords")
    .select("*")
    .eq("client_id", clientId);

  if (keywordsError) {
    return NextResponse.json({ error: keywordsError.message }, { status: 500 });
  }

  if (!keywords || keywords.length === 0) {
    return NextResponse.json({ error: "등록된 모니터링 질문이 없습니다." }, { status: 400 });
  }

  const { data: run, error: runError } = await supabase
    .from("monitoring_runs")
    .insert({ client_id: clientId })
    .select()
    .single();

  if (runError || !run) {
    return NextResponse.json({ error: runError?.message ?? "실행 생성 실패" }, { status: 500 });
  }

  const providers: Provider[] = ["chatgpt", "gemini"];

  const resultsToInsert = (
    await Promise.all(
      keywords.flatMap((keyword) =>
        providers.map(async (provider) => {
          const rawResponse = await runProvider(provider, keyword.text);
          const analysis = await safeAnalyze(rawResponse, client.name);
          return {
            run_id: run.id,
            keyword_id: keyword.id,
            provider,
            mentioned: analysis.mentioned,
            rank: analysis.rank,
            raw_response: rawResponse,
            competitors: analysis.competitors,
          };
        })
      )
    )
  );

  const { data: insertedResults, error: insertError } = await supabase
    .from("monitoring_results")
    .insert(resultsToInsert)
    .select();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ run, results: insertedResults, keywords });
}
