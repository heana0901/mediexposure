import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { assertClientAccess } from "@/lib/dal";
import { analyzeResponse } from "@/lib/analysis";
import { describeAiError } from "@/lib/aiError";
import { getManualChecks, isMissingTable, parseProvider } from "@/lib/manualChecks";

const SETUP_MESSAGE =
  "실제 화면 비교를 쓰려면 Supabase에서 015 마이그레이션(supabase/migrations/015_manual_checks.sql)을 먼저 실행해 주세요.";

/** 붙여넣는 답변의 최대 길이. AI 답변 한 건은 보통 수천 자 이내다. */
const MAX_RESPONSE_LENGTH = 30_000;

function todayKst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * 실제로 검색한 날짜(YYYY-MM-DD, 한국 시간). 오늘이면 지금 시각, 지난 날이면 그날 정오로 둔다.
 * 형식이 틀렸거나 미래 날짜면 null.
 */
function parseCheckedAt(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return new Date().toISOString();
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const today = todayKst();
  if (value > today) return null;
  if (value === today) return new Date().toISOString();
  const date = new Date(`${value}T12:00:00+09:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await assertClientAccess(id);
  if (!access.ok) return NextResponse.json({ error: "권한이 없습니다." }, { status: access.status });

  try {
    return NextResponse.json(await getManualChecks(getSupabaseServerClient(), id));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await assertClientAccess(id);
  if (!access.ok) return NextResponse.json({ error: "권한이 없습니다." }, { status: access.status });

  const body = await request.json().catch(() => ({}));
  const provider = parseProvider(body.provider);
  const rawResponse = typeof body.rawResponse === "string" ? body.rawResponse.trim() : "";
  const keywordId = typeof body.keywordId === "string" ? body.keywordId : "";
  const checkedAt = parseCheckedAt(body.checkedAt);

  if (!provider) return NextResponse.json({ error: "AI를 선택해 주세요." }, { status: 400 });
  if (!rawResponse) return NextResponse.json({ error: "실제 화면의 답변을 붙여넣어 주세요." }, { status: 400 });
  if (rawResponse.length > MAX_RESPONSE_LENGTH) {
    return NextResponse.json({ error: "답변이 너무 깁니다. 답변 본문만 붙여넣어 주세요." }, { status: 400 });
  }
  if (!checkedAt) return NextResponse.json({ error: "검색한 날짜를 확인해 주세요." }, { status: 400 });

  const supabase = getSupabaseServerClient();

  const { data: keyword } = await supabase
    .from("keywords")
    .select("id, text")
    .eq("id", keywordId)
    .eq("client_id", id)
    .maybeSingle();
  if (!keyword) return NextResponse.json({ error: "질문을 선택해 주세요." }, { status: 400 });

  const { data: client } = await supabase.from("clients").select("name, client_type").eq("id", id).maybeSingle();
  if (!client) return NextResponse.json({ error: "클라이언트를 찾을 수 없습니다." }, { status: 404 });

  // API 측정과 같은 분석기로 판정해야 둘을 공정하게 비교할 수 있다
  let analysis;
  try {
    analysis = await analyzeResponse(rawResponse, client.name, client.client_type ?? "hospital");
  } catch (err) {
    return NextResponse.json({ error: `답변 분석 실패 — ${describeAiError(err)}` }, { status: 502 });
  }

  const { data, error } = await supabase
    .from("manual_checks")
    .insert({
      client_id: id,
      keyword_id: keyword.id,
      keyword_text: keyword.text,
      provider,
      raw_response: rawResponse,
      mentioned: analysis.mentioned,
      rank: analysis.rank,
      competitors: analysis.competitors,
      checked_at: checkedAt,
      created_by: access.session.username,
    })
    .select()
    .single();

  if (error) {
    if (isMissingTable(error.message)) return NextResponse.json({ error: SETUP_MESSAGE }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
