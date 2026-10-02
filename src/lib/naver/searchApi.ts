import "server-only";
import { clientNameVariants } from "../nameMatch";

/**
 * 네이버 검색 API — 같은 질문으로 네이버 플레이스(지역)·블로그·웹문서에서 우리 병원이 몇 위인지.
 *
 * 네이버 개발자센터는 2026-07-31부터 검색 API 신규 발급을 멈췄고, 검색은 네이버클라우드
 * NAVER API HUB(console.ncloud.com)로 옮겨 갔다. 그래서 API HUB 주소로 먼저 묻고, 인증이
 * 거절되면 예전 개발자센터 주소로 한 번 더 묻는다(예전에 발급받은 키도 계속 쓸 수 있게).
 * 키는 NAVER_SEARCH_CLIENT_ID · NAVER_SEARCH_CLIENT_SECRET 하나로 둘 다 쓴다.
 *
 * API HUB 애플리케이션은 검색 서비스(블로그·지역·웹문서)를 하나씩 골라 등록한다.
 * 등록하지 않은 서비스는 따로 실패로 남기고 나머지 결과는 그대로 쓴다.
 * 네이버 AI 브리핑 답변 자체는 이 API로 볼 수 없다.
 */
type Kind = "local" | "blog" | "webkr";

const KIND_LABEL: Record<Kind, string> = { local: "플레이스(지역)", blog: "블로그", webkr: "웹문서" };

const ENDPOINTS = [
  {
    name: "NAVER API HUB",
    url: (kind: Kind) => `https://naverapihub.apigw.ntruss.com/search/v1/${kind}`,
    headers: (id: string, secret: string) => ({ "X-NCP-APIGW-API-KEY-ID": id, "X-NCP-APIGW-API-KEY": secret }),
  },
  {
    name: "네이버 개발자센터",
    url: (kind: Kind) => `https://openapi.naver.com/v1/search/${kind}.json`,
    headers: (id: string, secret: string) => ({ "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret }),
  },
];

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

class SearchError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function search(kind: Kind, query: string, display: number): Promise<Item[]> {
  const id = process.env.NAVER_SEARCH_CLIENT_ID!.trim();
  const secret = process.env.NAVER_SEARCH_CLIENT_SECRET!.trim();
  const params = new URLSearchParams({ query, display: String(display), start: "1" });
  if (kind !== "webkr") params.set("sort", kind === "local" ? "random" : "sim");

  let firstError: SearchError | null = null;
  for (const endpoint of ENDPOINTS) {
    const res = await fetch(`${endpoint.url(kind)}?${params}`, {
      headers: endpoint.headers(id, secret),
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      const json = (await res.json()) as { items?: Item[] };
      return json.items ?? [];
    }
    const error = new SearchError(await describeSearchError(res, kind, endpoint.name), res.status);
    firstError ??= error;
    // 인증 거절이 아니면(한도 초과·서버 오류) 다른 주소로 물어도 소용없다
    if (res.status !== 401 && res.status !== 403) throw error;
  }
  throw firstError!;
}

/** 네이버 검색 API 오류를 원인이 보이는 문장으로 */
async function describeSearchError(res: Response, kind: Kind, endpointName: string): Promise<string> {
  let detail = "";
  try {
    const body = (await res.json()) as { errorMessage?: string; errorCode?: string; error?: { message?: string } };
    detail = [body.errorMessage ?? body.error?.message, body.errorCode && `코드 ${body.errorCode}`]
      .filter(Boolean)
      .join(", ");
  } catch {
    // 본문이 JSON이 아니면 상태 코드만 쓴다
  }
  const label = KIND_LABEL[kind];
  const reason =
    res.status === 401 || res.status === 403
      ? `${label} 검색 인증 실패 — NAVER API HUB 애플리케이션의 Client ID·Secret이 Vercel 값과 같은지, 그리고 검색 서비스에 '${label}'가 등록돼 있는지 확인하세요.`
      : res.status === 429
        ? "네이버 검색 API 하루 호출 한도를 넘었습니다."
        : `${label} 검색 오류 (${res.status})`;
  return detail ? `${reason} (${endpointName} 응답: ${detail})` : reason;
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

/** 조회하지 못한 검색은 total을 -1로 남긴다(결과 0건과 구별하기 위해) */
export const UNAVAILABLE = -1;

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
  /** 조회하지 못한 검색과 그 이유 */
  errors: string[];
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

  const [localResult, blogResult, webResult] = await Promise.allSettled([
    search("local", query, 5),
    search("blog", query, 10),
    search("webkr", query, 10),
  ]);
  const errors = [localResult, blogResult, webResult]
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));
  if (errors.length === 3) throw new Error([...new Set(errors)].join(" / "));

  const local = localResult.status === "fulfilled" ? localResult.value : null;
  const blogs = blogResult.status === "fulfilled" ? blogResult.value : null;
  const web = webResult.status === "fulfilled" ? webResult.value : null;

  const topLocal = (local ?? []).map((i) => ({
    title: plain(i.title),
    address: plain(i.roadAddress || i.address),
    ours: mentions(plain(i.title)),
  }));
  const localIndex = topLocal.findIndex((l) => l.ours);

  const topBlogs = (blogs ?? []).map((i) => {
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

  const webIndex =
    web && domain
      ? web.findIndex((i) => {
          const host = domainOf(i.link);
          return host !== null && (host === domain || host.endsWith(`.${domain}`));
        })
      : -1;

  return {
    localRank: localIndex === -1 ? null : localIndex + 1,
    localTotal: local ? topLocal.length : UNAVAILABLE,
    topLocal,
    blogRank: blogIndex === -1 ? null : blogIndex + 1,
    blogOwnCount: topBlogs.filter((b) => b.own).length,
    blogMentionCount: topBlogs.filter((b) => b.mentions).length,
    blogTotal: blogs ? topBlogs.length : UNAVAILABLE,
    topBlogs,
    webRank: webIndex === -1 ? null : webIndex + 1,
    webTotal: web ? web.length : UNAVAILABLE,
    errors: [...new Set(errors)],
  };
}
