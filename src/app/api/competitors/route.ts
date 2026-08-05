import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ error: "clientId가 필요합니다." }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  const { data: keywords, error: keywordsError } = await supabase
    .from("keywords")
    .select("id")
    .eq("client_id", clientId);

  if (keywordsError) {
    return NextResponse.json({ error: keywordsError.message }, { status: 500 });
  }

  const keywordIds = (keywords ?? []).map((k) => k.id);
  if (keywordIds.length === 0) {
    return NextResponse.json({ unexposed: [], competitorFrequency: [], totalResults: 0 });
  }

  const { data: results, error: resultsError } = await supabase
    .from("monitoring_results")
    .select("*, keywords(text)")
    .in("keyword_id", keywordIds);

  if (resultsError) {
    return NextResponse.json({ error: resultsError.message }, { status: 500 });
  }

  const allResults = results ?? [];

  const unexposed = allResults.filter((r) => !r.mentioned);

  const frequency = new Map<string, number>();
  for (const r of allResults) {
    for (const name of (r.competitors as string[] | null) ?? []) {
      frequency.set(name, (frequency.get(name) ?? 0) + 1);
    }
  }

  const competitorFrequency = Array.from(frequency.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const selfMentionCount = allResults.filter((r) => r.mentioned).length;
  const chatgptResults = allResults.filter((r) => r.provider === "chatgpt");
  const geminiResults = allResults.filter((r) => r.provider === "gemini");

  return NextResponse.json({
    unexposed,
    competitorFrequency,
    totalResults: allResults.length,
    selfExposure: {
      count: selfMentionCount,
      total: allResults.length,
      chatgpt: {
        count: chatgptResults.filter((r) => r.mentioned).length,
        total: chatgptResults.length,
      },
      gemini: {
        count: geminiResults.filter((r) => r.mentioned).length,
        total: geminiResults.length,
      },
    },
  });
}
