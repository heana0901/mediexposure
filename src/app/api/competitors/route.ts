import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { assertClientAccess } from "@/lib/dal";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ error: "clientId가 필요합니다." }, { status: 400 });
  }

  const access = await assertClientAccess(clientId);
  if (!access.ok) return NextResponse.json({ error: "권한이 없습니다." }, { status: access.status });

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
    return NextResponse.json({ unexposed: [], competitorFrequency: [], sourceFrequency: [], totalResults: 0 });
  }

  const { data: results, error: resultsError } = await supabase
    .from("monitoring_results")
    .select("*, keywords(text)")
    .in("keyword_id", keywordIds);

  if (resultsError) {
    return NextResponse.json({ error: resultsError.message }, { status: 500 });
  }

  const allResults = results ?? [];

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const unexposed = allResults.filter((r) => !r.mentioned && new Date(r.created_at) >= sevenDaysAgo);

  const frequency = new Map<string, { chatgpt: number; gemini: number }>();
  for (const r of allResults) {
    for (const name of (r.competitors as string[] | null) ?? []) {
      const entry = frequency.get(name) ?? { chatgpt: 0, gemini: 0 };
      if (r.provider === "chatgpt") entry.chatgpt += 1;
      else entry.gemini += 1;
      frequency.set(name, entry);
    }
  }

  const competitorFrequency = Array.from(frequency.entries())
    .map(([name, counts]) => ({
      name,
      chatgpt: counts.chatgpt,
      gemini: counts.gemini,
      total: counts.chatgpt + counts.gemini,
    }))
    .sort((a, b) => b.total - a.total);

  // Gemini grounding이 실제 출처 대신 반환하는 리다이렉트 도메인은 집계에서 제외
  const IGNORED_SOURCE_DOMAINS = ["vertexaisearch.cloud.google.com"];

  const sourceFrequencyMap = new Map<string, { chatgpt: number; gemini: number }>();
  for (const r of allResults) {
    for (const source of (r.sources as { title: string; url: string }[] | null) ?? []) {
      let domain: string;
      try {
        domain = new URL(source.url).hostname.replace(/^www\./, "");
      } catch {
        continue;
      }
      if (IGNORED_SOURCE_DOMAINS.includes(domain)) continue;
      const entry = sourceFrequencyMap.get(domain) ?? { chatgpt: 0, gemini: 0 };
      if (r.provider === "chatgpt") entry.chatgpt += 1;
      else entry.gemini += 1;
      sourceFrequencyMap.set(domain, entry);
    }
  }

  const sourceFrequency = Array.from(sourceFrequencyMap.entries())
    .map(([domain, counts]) => ({
      domain,
      chatgpt: counts.chatgpt,
      gemini: counts.gemini,
      total: counts.chatgpt + counts.gemini,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const selfMentionCount = allResults.filter((r) => r.mentioned).length;
  const chatgptResults = allResults.filter((r) => r.provider === "chatgpt");
  const geminiResults = allResults.filter((r) => r.provider === "gemini");

  return NextResponse.json({
    unexposed,
    competitorFrequency,
    sourceFrequency,
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
