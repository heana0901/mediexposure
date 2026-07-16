import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();

  const { data: run, error: runError } = await supabase
    .from("monitoring_runs")
    .select("*")
    .eq("id", id)
    .single();

  if (runError || !run) {
    return NextResponse.json({ error: "실행 이력을 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: results, error: resultsError } = await supabase
    .from("monitoring_results")
    .select("*, keywords(text)")
    .eq("run_id", id);

  if (resultsError) {
    return NextResponse.json({ error: resultsError.message }, { status: 500 });
  }

  return NextResponse.json({ run, results });
}
