import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getSupabaseServerClient } from "@/lib/supabase";
import { assertClientAccess } from "@/lib/dal";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ANALYSIS_MODEL = process.env.ANALYSIS_MODEL || "gpt-4o-mini";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await assertClientAccess(id);
  if (!access.ok) return NextResponse.json({ error: "권한이 없습니다." }, { status: access.status });

  const supabase = getSupabaseServerClient();

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("name, client_type, department")
    .eq("id", id)
    .single();
  if (clientError || !client) {
    return NextResponse.json({ error: "클라이언트를 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: keywords } = await supabase.from("keywords").select("id, text").eq("client_id", id);
  const keywordIds = (keywords ?? []).map((k) => k.id);
  if (keywordIds.length === 0) {
    return NextResponse.json({ suggestions: "등록된 모니터링 질문이 없어 제안을 생성할 수 없습니다." });
  }
  const keywordTextById = new Map((keywords ?? []).map((k) => [k.id, k.text]));

  const { data: results, error: resultsError } = await supabase
    .from("monitoring_results")
    .select("keyword_id, mentioned, competitors, created_at")
    .in("keyword_id", keywordIds);
  if (resultsError) return NextResponse.json({ error: resultsError.message }, { status: 500 });

  const allResults = results ?? [];
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const unexposed = allResults.filter((r) => !r.mentioned && new Date(r.created_at) >= threeDaysAgo);

  const competitorCount = new Map<string, number>();
  for (const r of allResults) {
    for (const name of (r.competitors as string[] | null) ?? []) {
      competitorCount.set(name, (competitorCount.get(name) ?? 0) + 1);
    }
  }
  const topCompetitors = Array.from(competitorCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);

  if (unexposed.length === 0) {
    return NextResponse.json({ suggestions: "최근 3일간 미노출 항목이 없습니다. 지금 콘텐츠 전략이 잘 작동하고 있습니다." });
  }

  const unexposedKeywords = Array.from(new Set(unexposed.map((r) => keywordTextById.get(r.keyword_id) ?? ""))).filter(
    Boolean
  );
  const subject = client.client_type === "business" ? "업체" : "병원";

  const prompt = `${subject}명: ${client.name}${client.department ? ` (${client.department})` : ""}

최근 3일간 AI 검색에서 노출되지 않은 질문 목록:
${unexposedKeywords.map((k) => `- ${k}`).join("\n")}

같은 질문들에서 대신 자주 언급된 경쟁 ${subject}:
${topCompetitors.length > 0 ? topCompetitors.join(", ") : "없음"}

위 정보를 바탕으로, 이 ${subject}이 AI 검색(ChatGPT, Gemini)에 더 잘 노출되기 위해 홈페이지나 블로그에 보강하면 좋을 구체적인 콘텐츠/FAQ 주제를 4~6개, 한국어로 간결하게 목록으로 제안해줘. 각 항목은 "왜 필요한지"도 한 줄로 같이 설명해줘.`;

  try {
    const completion = await openai.chat.completions.create({
      model: ANALYSIS_MODEL,
      messages: [{ role: "user", content: prompt }],
    });
    const suggestions = completion.choices[0]?.message?.content ?? "제안을 생성하지 못했습니다.";
    return NextResponse.json({ suggestions });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "제안 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
