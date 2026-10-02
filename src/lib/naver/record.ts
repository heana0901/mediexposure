import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureSearchKeywords, refreshSearchVolumes } from "./demand";
import { checkNaverExposure, naverSearchConfigured } from "./searchApi";

type KeywordLike = { id: string; text: string; search_keyword?: string | null };
type ClientLike = { name: string; aliases?: unknown; website_url?: string | null; naver_blog_url?: string | null };

/**
 * 모니터링 실행 끝에 네이버 쪽을 함께 기록한다.
 * - 질문별 대표 검색어·월간 검색량 채우기 (검색광고 API)
 * - 같은 검색어로 네이버 플레이스·블로그·웹문서 순위 남기기 (검색 API)
 * 여기서 실패해도 이미 저장한 AI 결과는 그대로 두고 경고만 돌려준다.
 */
export async function recordNaver(
  supabase: SupabaseClient,
  runId: string,
  keywords: KeywordLike[],
  client: ClientLike
): Promise<string[]> {
  const warnings: string[] = [];

  try {
    await ensureSearchKeywords(supabase, keywords);
    await refreshSearchVolumes(supabase, keywords);
  } catch (err) {
    warnings.push(`네이버 검색량을 가져오지 못했습니다: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!naverSearchConfigured()) return warnings;

  const aliases = Array.isArray(client.aliases) ? client.aliases.filter((a): a is string => typeof a === "string") : [];
  let failed = 0;
  const rows = (
    await Promise.all(
      keywords.map(async (k) => {
        const query = k.search_keyword || k.text;
        try {
          const e = await checkNaverExposure(query, { ...client, aliases });
          return {
            run_id: runId,
            keyword_id: k.id,
            search_keyword: query,
            local_rank: e.localRank,
            local_total: e.localTotal,
            blog_rank: e.blogRank,
            blog_own_count: e.blogOwnCount,
            blog_mention_count: e.blogMentionCount,
            blog_total: e.blogTotal,
            web_rank: e.webRank,
            web_total: e.webTotal,
            top_local: e.topLocal,
            top_blogs: e.topBlogs,
          };
        } catch (err) {
          failed += 1;
          console.error("[naver] 검색 API 실패", query, err);
          return null;
        }
      })
    )
  ).filter((r): r is NonNullable<typeof r> => r !== null);

  if (failed) warnings.push(`네이버 검색 API 호출 ${failed}건이 실패했습니다. 키와 호출 한도를 확인하세요.`);
  if (rows.length) {
    const { error } = await supabase.from("naver_results").insert(rows);
    if (error) warnings.push(`네이버 노출 기록을 저장하지 못했습니다(017 마이그레이션 확인): ${error.message}`);
  }
  return warnings;
}
