import "server-only";
import { clientNameVariants } from "../nameMatch";

/**
 * 네이버 검색 API — 같은 질문으로 네이버 플레이스(지역)·블로그·웹문서에서 우리 병원이 몇 위인지.
 *
 * 네이버 개발자센터(developers.naver.com)에서 '검색' API를 사용하는 애플리케이션을 만들고
 * 받은 값을 환경변수에 넣으면 켜진다: NAVER_SEARCH_CLIENT_ID, NAVER_SEARCH_CLIENT_SECRET
 * (하루 25,000회까지 무료). 네이버 AI 브리핑 답변 자체는 이 API로 볼 수 없다.
 */
const BASE_URL = "https://openapi.naver.com/v1/search";

export function naverSearchConfigured(): boolean {
  return Boolean(process.env.NAVER_SEARCH_CLIENT_ID?.trim() && process.env.NAVER_SEARCH_CLIENT_SECRET?.trim());
}

type Item = {
  title?: string;
  link?: string;
  description?: string;
  bloggername?: string;
  bloggerlink?: string;
  address?: string;
  roadAddress?: string;
  category?: string;
};

async function search(kind: "local" | "blog" | "webkr", query: string, display: number): Promise<Item[]> {
  const params = new URLSearchParams({ query, display: String(display), start: "1" });
  if (kind !== "webkr") params.set("sort", kind === "local" ? "random" : "sim");
  const res = await fetch(`${BASE_URL}/${kind}.json?${params}`, {
    headers: {
      "X-Naver-Client-Id": process.env.NAVER_SEARCH_CLIENT_ID!.trim(),
      "X-Naver-Client-Secret": process.env.NAVER_SEARCH_CLIENT_SECRET!.trim(),
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`네이버 검색 API 오류 (${res.status})`);
  const json = (await res.json()) as { items?: Item[] };
  return json.items ?? [];
}

/** 네이버 검색 결과의 <b>…</b> 강조와 HTML 엔티티를 지운다 */
export function plain(text: string | undefined): string {
  return (text ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .trim();
}

function compact(text: string): string {
  return text.toLowerCase().replace(/[\s·・\-_.,'"()[\]]/g, "");
}

/** "https://blog.naver.com/jyphospital/2233" → "jyphospital" */
export function blogIdOf(url: string | null | undefined): string | null {
  const match = (url ?? "").match(/blog\.naver\.com\/([A-Za-z0-9_-]+)/i);
  return match ? match[1].toLowerCase() : null;
}

function domainOf(url: string | null | undefined): string | null {
  const domain = (url ?? "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[/?#]/)[0]
    .toLowerCase();
  return domain || null;
}

export type NaverExposure = {
  localRank: number | null;
  localTotal: number;
  topLocal: { title: string; address: string; ours: boolean }[];
  /** 우리 블로그 글이 처음 나온 순위 */
  blogRank: number | null;
  blogOwnCount: number;
  /** 제목·요약에 우리 병원 이름이 나온 글 수(누구 블로그든) */
  blogMentionCount: number;
  blogTotal: number;
  topBlogs: { title: string; link: string; blogger: string; own: boolean; mentions: boolean }[];
  webRank: number | null;
  webTotal: number;
};

export async function checkNaverExposure(
  query: string,
  client: { name: string; aliases?: string[]; website_url?: string | null; naver_blog_url?: string | null }
): Promise<NaverExposure> {
  const names = clientNameVariants(client.name, client.aliases ?? []);
  const mentions = (text: string) => {
    const c = compact(text);
    return names.some((n) => c.includes(n));
  };
  const blogId = blogIdOf(client.naver_blog_url);
  const domain = domainOf(client.website_url);

  const [local, blogs, web] = await Promise.all([
    search("local", query, 5),
    search("blog", query, 10),
    search("webkr", query, 10),
  ]);

  const topLocal = local.map((i) => ({
    title: plain(i.title),
    address: plain(i.roadAddress || i.address),
    ours: mentions(plain(i.title)),
  }));
  const localIndex = topLocal.findIndex((l) => l.ours);

  const topBlogs = blogs.map((i) => {
    const link = i.link ?? "";
    const own = Boolean(blogId && (link.toLowerCase().includes(`/${blogId}/`) || (i.bloggerlink ?? "").toLowerCase().includes(blogId)));
    return {
      title: plain(i.title),
      link,
      blogger: plain(i.bloggername),
      own,
      mentions: mentions(`${plain(i.title)} ${plain(i.description)}`),
    };
  });
  const blogIndex = topBlogs.findIndex((b) => b.own);

  const webIndex = domain
    ? web.findIndex((i) => {
        const host = domainOf(i.link);
        return host !== null && (host === domain || host.endsWith(`.${domain}`));
      })
    : -1;

  return {
    localRank: localIndex === -1 ? null : localIndex + 1,
    localTotal: topLocal.length,
    topLocal,
    blogRank: blogIndex === -1 ? null : blogIndex + 1,
    blogOwnCount: topBlogs.filter((b) => b.own).length,
    blogMentionCount: topBlogs.filter((b) => b.mentions).length,
    blogTotal: topBlogs.length,
    topBlogs,
    webRank: webIndex === -1 ? null : webIndex + 1,
    webTotal: web.length,
  };
}
