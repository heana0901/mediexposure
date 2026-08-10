import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getSupabaseServerClient } from "@/lib/supabase";
import { estimateCostUsd } from "@/lib/pricing";
import { assertClientAccess } from "@/lib/dal";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ANALYSIS_MODEL = process.env.ANALYSIS_MODEL || "gpt-4o-mini";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();

  const { data: result, error } = await supabase
    .from("monitoring_results")
    .select("*, keywords(text, client_id, clients(name, department, region, client_type))")
    .eq("id", id)
    .single();

  if (error || !result) {
    return NextResponse.json({ error: "결과를 찾을 수 없습니다." }, { status: 404 });
  }

  const keyword = result.keywords as unknown as {
    text: string;
    client_id: string;
    clients: { name: string; department: string | null; region: string | null; client_type: "hospital" | "business" };
  };
  const clientInfo = keyword.clients;
  const subject = clientInfo.client_type === "business" ? "업체" : "병원";

  const access = await assertClientAccess(keyword.client_id);
  if (!access.ok) return NextResponse.json({ error: "권한이 없습니다." }, { status: access.status });

  const prompt = `아래는 AI 검색엔진에 "${keyword.text}"라고 질문했을 때 나온 답변이다. 이 답변에 "${clientInfo.name}"${
    clientInfo.department ? ` (${clientInfo.department})` : ""
  } ${subject}이 언급되지 않았다.

답변 텍스트:
"""
${result.raw_response}
"""

언급된 경쟁 ${subject}: ${(result.competitors as string[]).join(", ") || "없음"}

이 ${subject}이 왜 언급되지 않았을지, 위에 언급된 경쟁 ${subject}들과 비교했을 때 어떤 점이 부족해서 노출되지 않았을 가능성이 높은지 마케팅 담당자가 참고할 수 있도록 2~3문장으로 간결하게 분석해줘.`;

  let analysisNote: string;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  try {
    const completion = await client.chat.completions.create({
      model: ANALYSIS_MODEL,
      messages: [{ role: "user", content: prompt }],
    });
    analysisNote = completion.choices[0]?.message?.content ?? "분석 결과를 생성하지 못했습니다.";
    inputTokens = completion.usage?.prompt_tokens ?? null;
    outputTokens = completion.usage?.completion_tokens ?? null;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  const callCost = estimateCostUsd(ANALYSIS_MODEL, inputTokens, outputTokens);
  const previousCost = (result.estimated_cost_usd as number | null) ?? 0;
  const previousInputTokens = (result.input_tokens as number | null) ?? 0;
  const previousOutputTokens = (result.output_tokens as number | null) ?? 0;

  const { data: updated, error: updateError } = await supabase
    .from("monitoring_results")
    .update({
      analysis_note: analysisNote,
      estimated_cost_usd: callCost === null ? result.estimated_cost_usd : previousCost + callCost,
      input_tokens: previousInputTokens + (inputTokens ?? 0),
      output_tokens: previousOutputTokens + (outputTokens ?? 0),
    })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json(updated);
}
