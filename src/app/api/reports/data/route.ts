import { NextResponse } from "next/server";
import { assertClientAccess } from "@/lib/dal";
import { getClientReportData } from "@/lib/reportData";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId가 필요합니다." }, { status: 400 });

  const access = await assertClientAccess(clientId);
  if (!access.ok) return NextResponse.json({ error: "권한이 없습니다." }, { status: access.status });

  try {
    const data = await getClientReportData(clientId);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "데이터를 불러오지 못했습니다." }, { status: 500 });
  }
}
