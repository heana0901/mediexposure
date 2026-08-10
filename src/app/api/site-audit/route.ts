import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import { runComparativeSiteAudit } from "@/lib/siteAudit";

export const maxDuration = 30;

export async function POST(request: Request) {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { urls } = await request.json();
  const list = (Array.isArray(urls) ? urls : [])
    .filter((u: unknown): u is string => typeof u === "string" && u.trim().length > 0)
    .slice(0, 4);

  if (list.length === 0) {
    return NextResponse.json({ error: "URL을 입력하세요." }, { status: 400 });
  }

  try {
    const result = await runComparativeSiteAudit(list);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "분석 중 오류가 발생했습니다." }, { status: 500 });
  }
}
