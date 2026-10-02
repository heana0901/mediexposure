import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { verifySession } from "@/lib/dal";
import { INTERVAL_OPTIONS } from "@/lib/schedule";

/** 병원별 자동 모니터링 주기(일) 변경. null이면 기본 주기로 되돌린다. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!session.isAdmin) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const { intervalDays } = await request.json();
  if (intervalDays !== null && !(INTERVAL_OPTIONS as readonly number[]).includes(intervalDays)) {
    return NextResponse.json({ error: "주기를 선택하세요." }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("clients")
    .update({ monitor_interval_days: intervalDays })
    .eq("id", id)
    .select("id, monitor_interval_days")
    .single();

  if (error) {
    const missing = /monitor_interval_days/.test(error.message);
    return NextResponse.json(
      { error: missing ? "DB에 주기 칸이 아직 없습니다. 018 마이그레이션을 실행하세요." : error.message },
      { status: 500 }
    );
  }
  return NextResponse.json(data);
}
