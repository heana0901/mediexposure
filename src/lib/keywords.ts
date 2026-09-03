import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

export type KeywordRow = {
  id: string;
  client_id: string;
  text: string;
  created_at: string;
  deleted_at?: string | null;
};

/**
 * 살아 있는 질문만 조회한다.
 *
 * 질문을 지우면 그 질문으로 쌓아 온 모니터링 결과까지 사라지기 때문에,
 * 앱은 진짜 삭제 대신 keywords.deleted_at 에 시각만 찍는다.
 * 그래서 "앞으로 무엇을 물어볼지" 정하는 곳은 전부 이 함수를 써야 한다.
 *
 * 반대로 지난 기록을 집계하는 곳(리포트·비용·경쟁분석)은 이 함수를 쓰면 안 된다.
 * 지운 질문으로 얻은 과거 결과도 그대로 보여야 하기 때문이다.
 *
 * 013 마이그레이션 전이면 deleted_at 컬럼이 없으므로 필터 없이 다시 조회한다.
 */
export async function selectActiveKeywords(
  supabase: SupabaseClient,
  clientId: string,
  columns = "*"
): Promise<{ data: KeywordRow[] | null; error: PostgrestError | null }> {
  const base = () =>
    supabase
      .from("keywords")
      .select(columns)
      .eq("client_id", clientId)
      .order("created_at", { ascending: true });

  const filtered = await base().is("deleted_at", null);
  const result =
    filtered.error && filtered.error.message.includes("deleted_at")
      ? (console.warn(
          "keywords.deleted_at 컬럼이 없어 전체 질문을 대상으로 합니다. 013 마이그레이션을 실행하세요."
        ),
        await base())
      : filtered;

  // select()에 문자열 컬럼 목록을 넘기면 supabase-js가 행 타입을 좁히지 못한다.
  return { data: (result.data as unknown as KeywordRow[] | null) ?? null, error: result.error };
}
