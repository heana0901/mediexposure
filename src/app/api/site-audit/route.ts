import { NextResponse } from "next/server";
import { verifySession, assertClientAccess } from "@/lib/dal";
import { getSupabaseServerClient } from "@/lib/supabase";
import { runComparativeSiteAudit } from "@/lib/siteAudit";

export const maxDuration = 30;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId가 필요합니다." }, { status: 400 });

  const access = await assertClientAccess(clientId);
  if (!access.ok) return NextResponse.json({ error: "권한이 없습니다." }, { status: access.status });

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("site_audits")
    .select("urls, result, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? null);
}

export async function POST(request: Request) {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { urls, clientId } = await request.json();
  const list = (Array.isArray(urls) ? urls : [])
    .filter((u: unknown): u is string => typeof u === "string" && u.trim().length > 0)
    .slice(0, 4);

  if (list.length === 0) {
    return NextResponse.json({ error: "URL을 입력하세요." }, { status: 400 });
  }

  if (clientId) {
    const access = await assertClientAccess(clientId);
    if (!access.ok) return NextResponse.json({ error: "권한이 없습니다." }, { status: access.status });
  }

  try {
    const result = await runComparativeSiteAudit(list);

    if (clientId) {
      const supabase = getSupabaseServerClient();
      await supabase.from("site_audits").insert({ client_id: clientId, urls: list, result });
    }

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "분석 중 오류가 발생했습니다." }, { status: 500 });
  }
}
