import "server-only";
import { getSupabaseServerClient } from "./supabase";
import type { CompetitorFrequencyEntry, SelfExposure } from "./types";

export type ClientReportData = {
  client: {
    id: string;
    name: string;
    client_type: "hospital" | "business";
    region: string | null;
    department: string | null;
    director_name: string | null;
    contact_email: string | null;
  };
  selfExposure: SelfExposure;
  competitorTop5: CompetitorFrequencyEntry[];
  unexposedRecent: { provider: "chatgpt" | "gemini"; keyword: string; competitors: string[] }[];
  unexposedCount: number;
  weeklyTrend: { createdAt: string; chatgptRate: number | null; geminiRate: number | null; overallRate: number | null }[];
};

export async function getClientReportData(clientId: string): Promise<ClientReportData> {
  const supabase = getSupabaseServerClient();

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, name, client_type, region, department, director_name, contact_email")
    .eq("id", clientId)
    .single();
  if (clientError || !client) throw new Error(clientError?.message ?? "클라이언트를 찾을 수 없습니다.");

  const emptySelf: SelfExposure = {
    count: 0,
    total: 0,
    chatgpt: { count: 0, total: 0 },
    gemini: { count: 0, total: 0 },
  };

  const { data: keywords } = await supabase.from("keywords").select("id").eq("client_id", clientId);
  const keywordIds = (keywords ?? []).map((k) => k.id);

  if (keywordIds.length === 0) {
    return { client, selfExposure: emptySelf, competitorTop5: [], unexposedRecent: [], unexposedCount: 0, weeklyTrend: [] };
  }

  const { data: results } = await supabase
    .from("monitoring_results")
    .select("*, keywords(text)")
    .in("keyword_id", keywordIds);
  const allResults = results ?? [];

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const unexposedAll = allResults.filter((r) => !r.mentioned && new Date(r.created_at) >= sevenDaysAgo);

  const frequency = new Map<string, { chatgpt: number; gemini: number }>();
  for (const r of allResults) {
    for (const name of (r.competitors as string[] | null) ?? []) {
      const entry = frequency.get(name) ?? { chatgpt: 0, gemini: 0 };
      if (r.provider === "chatgpt") entry.chatgpt += 1;
      else entry.gemini += 1;
      frequency.set(name, entry);
    }
  }
  const competitorTop5 = Array.from(frequency.entries())
    .map(([name, counts]) => ({ name, chatgpt: counts.chatgpt, gemini: counts.gemini, total: counts.chatgpt + counts.gemini }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const chatgptResults = allResults.filter((r) => r.provider === "chatgpt");
  const geminiResults = allResults.filter((r) => r.provider === "gemini");
  const selfExposure: SelfExposure = {
    count: allResults.filter((r) => r.mentioned).length,
    total: allResults.length,
    chatgpt: { count: chatgptResults.filter((r) => r.mentioned).length, total: chatgptResults.length },
    gemini: { count: geminiResults.filter((r) => r.mentioned).length, total: geminiResults.length },
  };

  const unexposedRecent = unexposedAll.slice(0, 8).map((r) => ({
    provider: r.provider as "chatgpt" | "gemini",
    keyword: (r.keywords as unknown as { text: string })?.text ?? "",
    competitors: (r.competitors as string[] | null) ?? [],
  }));

  const { data: runs } = await supabase
    .from("monitoring_runs")
    .select("id, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });
  const runIds = (runs ?? []).map((r) => r.id);

  const { data: runResults } = runIds.length
    ? await supabase.from("monitoring_results").select("run_id, provider, mentioned").in("run_id", runIds)
    : { data: [] as { run_id: string; provider: string; mentioned: boolean }[] };

  const rate = (list: { mentioned: boolean }[]) =>
    list.length === 0 ? null : Math.round((list.filter((r) => r.mentioned).length / list.length) * 100);

  // 같은 날짜에 여러 번 실행됐으면 그날의 결과를 모두 합쳐서 하나로 집계한다
  const runDateById = new Map((runs ?? []).map((r) => [r.id, r.created_at.slice(0, 10)]));
  const resultsByDate = new Map<string, { provider: string; mentioned: boolean }[]>();
  for (const result of runResults ?? []) {
    const dateKey = runDateById.get(result.run_id);
    if (!dateKey) continue;
    const list = resultsByDate.get(dateKey) ?? [];
    list.push(result);
    resultsByDate.set(dateKey, list);
  }
  const sortedDates = Array.from(resultsByDate.keys()).sort();

  const weeklyTrend = sortedDates.slice(-7).map((dateKey) => {
    const forDate = resultsByDate.get(dateKey) ?? [];
    return {
      createdAt: dateKey,
      chatgptRate: rate(forDate.filter((r) => r.provider === "chatgpt")),
      geminiRate: rate(forDate.filter((r) => r.provider === "gemini")),
      overallRate: rate(forDate),
    };
  });

  return { client, selfExposure, competitorTop5, unexposedRecent, unexposedCount: unexposedAll.length, weeklyTrend };
}
