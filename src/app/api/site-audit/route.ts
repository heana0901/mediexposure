import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import { runSiteAudit } from "@/lib/siteAudit";

export const maxDuration = 30;

export async function POST(request: Request) {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { url } = await request.json();
  if (!url || typeof url !== "string" || !url.trim()) {
    return NextResponse.json({ error: "URL을 입력하세요." }, { status: 400 });
  }

  try {
    const result = await runSiteAudit(url.trim());
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "분석 중 오류가 발생했습니다." }, { status: 500 });
  }
}
