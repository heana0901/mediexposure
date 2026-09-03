import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * AI 검색 노출 진단 엔진.
 *
 * URL을 받아 서버가 직접 HTML을 가져와 25개 항목을 검사하고 100점 만점 점수를 냅니다.
 * 외부에서 받은 URL로 서버가 요청하므로 SSRF 방어(normalizeTargetUrl)가 필수입니다.
 */

import {
  AXIS_META,
  AXIS_ORDER,
  gradeOf,
  type Axis,
  type AxisScore,
  type CheckResult,
  type CheckStatus,
  type SiteDiagnosis,
} from "./diagnose-shared";

export type { Axis, AxisScore, CheckResult, CheckStatus, SiteDiagnosis };
export { AXIS_META };

/* ───────────────────────── URL 검증 (SSRF 방어) ───────────────────────── */

const PRIVATE_V4 =
  /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;

function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return PRIVATE_V4.test(address);
  if (version === 6) {
    const v6 = address.toLowerCase();
    // 루프백, 링크 로컬, 유니크 로컬, IPv4 매핑
    if (v6 === "::1" || v6 === "::") return true;
    if (v6.startsWith("fe80") || v6.startsWith("fc") || v6.startsWith("fd")) return true;
    if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  }
  return false;
}

export class DiagnosisError extends Error {}

/**
 * 사용자가 입력한 문자열을 안전한 공개 URL로 정규화합니다.
 * 사설망·루프백·비 HTTP 스킴을 모두 거부합니다.
 */
export async function normalizeTargetUrl(input: string): Promise<URL> {
  const trimmed = input.trim();
  if (!trimmed) throw new DiagnosisError("홈페이지 주소를 입력해 주세요.");
  if (trimmed.length > 2048) throw new DiagnosisError("주소가 너무 깁니다.");

  // http(s)가 아닌 스킴을 붙여 온 경우를 먼저 걸러냅니다.
  // (그냥 https://를 덧붙이면 "https://ftp://x.com"이 되어 엉뚱한 오류가 납니다)
  const scheme = trimmed.match(/^([a-z][a-z0-9+.-]*):\/\//i)?.[1]?.toLowerCase();
  if (scheme && scheme !== "http" && scheme !== "https") {
    throw new DiagnosisError("http 또는 https 주소만 진단할 수 있습니다.");
  }

  let url: URL;
  try {
    url = new URL(scheme ? trimmed : `https://${trimmed}`);
  } catch {
    throw new DiagnosisError("주소 형식이 올바르지 않습니다. 예: hospital.co.kr");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new DiagnosisError("http 또는 https 주소만 진단할 수 있습니다.");
  }

  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new DiagnosisError("내부 주소는 진단할 수 없습니다.");
  }
  if (!host.includes(".")) {
    throw new DiagnosisError("올바른 도메인을 입력해 주세요. 예: hospital.co.kr");
  }
  if (isIP(host) && isPrivateAddress(host)) {
    throw new DiagnosisError("내부 네트워크 주소는 진단할 수 없습니다.");
  }

  // DNS가 사설 대역을 가리키는 경우도 차단합니다.
  if (!isIP(host)) {
    try {
      const records = await lookup(host, { all: true });
      if (records.some((r) => isPrivateAddress(r.address))) {
        throw new DiagnosisError("내부 네트워크를 가리키는 주소는 진단할 수 없습니다.");
      }
    } catch (error) {
      if (error instanceof DiagnosisError) throw error;
      throw new DiagnosisError("도메인을 찾을 수 없습니다. 주소를 다시 확인해 주세요.");
    }
  }

  return url;
}

/* ───────────────────────── 안전한 fetch ───────────────────────── */

const UA =
  "Mozilla/5.0 (compatible; MediExposureDiagnosisBot/2.0; +https://mediexposure.vercel.app)";
const MAX_BYTES = 3_000_000; // 3MB
const TIMEOUT_MS = 9_000;

/**
 * 응답 인코딩을 추정합니다.
 * 국내 병원 홈페이지 중에는 아직 EUC-KR을 쓰는 곳이 있어서, UTF-8로만 읽으면
 * 제목과 메타 설명이 깨진 글자로 표시됩니다.
 */
function detectCharset(contentType: string | null, head: string): string {
  const fromHeader = contentType?.match(/charset=["']?([\w-]+)/i)?.[1];
  if (fromHeader) return fromHeader.toLowerCase();
  const fromMeta =
    head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ??
    head.match(/<meta[^>]+content=["'][^"']*charset=([\w-]+)/i)?.[1];
  return (fromMeta ?? "utf-8").toLowerCase();
}

function decode(buffer: ArrayBuffer, charset: string): string {
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

type FetchedPage = { res: Response; body: string };

async function safeFetch(url: string): Promise<FetchedPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,*/*",
        "Accept-Language": "ko-KR,ko;q=0.9",
      },
      cache: "no-store",
    });

    // 지나치게 큰 문서는 본문 파싱을 포기합니다 (메모리 보호).
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES * 4) return { res, body: "" };

    const buffer = (await res.arrayBuffer()).slice(0, MAX_BYTES);
    // charset 선언은 문서 앞부분에 있으므로 ASCII로 먼저 훑어 확인합니다.
    const head = new TextDecoder("latin1").decode(buffer.slice(0, 4096));
    const body = decode(buffer, detectCharset(res.headers.get("content-type"), head));
    return { res, body };
  } finally {
    clearTimeout(timer);
  }
}

/* ───────────────────────── HTML 파싱 ───────────────────────── */

function firstMatch(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

function countMatches(html: string, re: RegExp): number {
  return (html.match(re) ?? []).length;
}

/** 스크립트·스타일을 제거하고 남은 본문 텍스트를 뽑습니다. */
function visibleText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * robots.txt를 파싱해 특정 크롤러가 루트를 크롤링할 수 있는지 확인합니다.
 * 연속된 User-agent 줄은 하나의 그룹으로 묶고, 그 봇 전용 그룹이 있으면
 * "*" 그룹보다 우선한다는 robots.txt 규칙을 따릅니다.
 */
function isAgentBlocked(robotsTxt: string, agent: string): boolean {
  const lines = robotsTxt
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, "").trim())
    .filter(Boolean);

  type Group = { agents: string[]; rules: { type: "allow" | "disallow"; value: string }[] };
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;

  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }

    lastWasAgent = false;
    if (!current) continue;
    if (key === "allow" || key === "disallow") current.rules.push({ type: key, value });
  }

  const target = agent.toLowerCase();
  const specific = groups.filter((g) => g.agents.includes(target));
  const applicable = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  if (!applicable.length) return false;

  for (const group of applicable) {
    let blocked = false;
    for (const rule of group.rules) {
      if (rule.type === "disallow" && rule.value === "/") blocked = true;
      if (rule.type === "allow" && (rule.value === "/" || rule.value === "*")) blocked = false;
    }
    if (blocked) return true;
  }
  return false;
}

const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "anthropic-ai",
  "PerplexityBot",
  "Google-Extended",
  "CCBot",
];

/* ───────────────────────── 점수 계산 ───────────────────────── */

function scoreChecks(checks: CheckResult[]): { axes: AxisScore[]; score: number } {
  const value = (c: CheckResult) => (c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0);

  const axes: AxisScore[] = AXIS_ORDER.map((axis) => {
    const items = checks.filter((c) => c.axis === axis);
    const totalWeight = items.reduce((sum, c) => sum + c.weight, 0) || 1;
    const earned = items.reduce((sum, c) => sum + c.weight * value(c), 0);
    return {
      axis,
      score: Math.round((earned / totalWeight) * 100),
      passed: items.filter((c) => c.status === "pass").length,
      total: items.length,
    };
  });

  // 축별 점수를 축 가중치(SEO 40 · AEO 20 · GEO 20 · 네이버 20)로 합산합니다.
  const score = Math.round(
    axes.reduce((sum, a) => sum + a.score * AXIS_META[a.axis].weight, 0) / 100
  );

  return { axes, score };
}

function pickPriorities(checks: CheckResult[]) {
  return checks
    .filter((c) => c.fix)
    .sort((a, b) => {
      const rank = (s: CheckStatus) => (s === "fail" ? 0 : 1);
      // 실패 항목 우선, 그다음 전체 점수에 미치는 영향이 큰 순서
      const impact = (c: CheckResult) => c.weight * AXIS_META[c.axis].weight;
      return rank(a.status) - rank(b.status) || impact(b) - impact(a);
    })
    .slice(0, 5)
    .map((c) => ({ name: c.name, fix: c.fix as string, axis: c.axis }));
}

/* ───────────────────────── 진단 실행 ───────────────────────── */

export async function runDiagnosis(target: URL): Promise<SiteDiagnosis> {
  const started = Date.now();

  let page: FetchedPage;
  try {
    page = await safeFetch(target.href);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new DiagnosisError(
        "홈페이지 응답이 9초 안에 오지 않았습니다. 사이트가 느리거나 외부 접근을 막고 있을 수 있습니다."
      );
    }
    throw new DiagnosisError(
      "홈페이지에 접속할 수 없습니다. 주소가 정확한지, 사이트가 정상 동작 중인지 확인해 주세요."
    );
  }

  const responseMs = Date.now() - started;
  const { res, body: html } = page;
  const finalUrl = res.url || target.href;
  const origin = new URL(finalUrl).origin;

  // robots.txt와 sitemap.xml은 실패해도 진단을 계속합니다.
  const [robotsResult, sitemapResult] = await Promise.allSettled([
    safeFetch(`${origin}/robots.txt`),
    safeFetch(`${origin}/sitemap.xml`),
  ]);

  const robotsTxt =
    robotsResult.status === "fulfilled" && robotsResult.value.res.ok
      ? robotsResult.value.body
      : null;

  const checks: CheckResult[] = [];

  /* 1. 접근 가능 여부 */
  const slow = responseMs > 3000;
  checks.push({
    id: "reachable",
    axis: "seo",
    name: "페이지 접근 가능 여부",
    detail: res.ok
      ? `정상 응답 (HTTP ${res.status}) · 응답 ${(responseMs / 1000).toFixed(1)}초${slow ? "로 느린 편" : ""}`
      : `HTTP ${res.status} 응답`,
    status: res.ok ? (slow ? "warn" : "pass") : "fail",
    fix: res.ok
      ? slow
        ? "응답이 3초를 넘으면 크롤러가 수집을 포기하는 경우가 있습니다. 이미지 용량과 서버 응답 속도를 점검하세요."
        : undefined
      : "페이지가 정상 응답하지 않습니다. 서버 상태와 주소를 먼저 확인해야 합니다.",
    weight: 20,
  });

  /* 2. AI 크롤러 차단 여부 */
  if (robotsTxt !== null) {
    const blocked = AI_CRAWLERS.filter((agent) => isAgentBlocked(robotsTxt, agent));
    checks.push({
      id: "ai-crawler",
      axis: "aeo",
      name: "AI 크롤러 차단 여부",
      detail: blocked.length
        ? `${blocked.join(", ")}가 robots.txt에서 차단되어 있습니다`
        : "주요 AI 크롤러가 차단되어 있지 않습니다",
      status: blocked.length ? "fail" : "pass",
      fix: blocked.length
        ? "robots.txt에서 해당 크롤러의 Disallow 규칙을 제거하세요. 차단된 상태에서는 콘텐츠를 아무리 잘 만들어도 AI가 접근하지 못합니다."
        : undefined,
      weight: 20,
    });
  } else {
    checks.push({
      id: "ai-crawler",
      axis: "aeo",
      name: "AI 크롤러 차단 여부",
      detail: "robots.txt를 찾을 수 없습니다 (기본적으로 모든 크롤러 허용 상태)",
      status: "warn",
      fix: "robots.txt를 만들어 GPTBot·OAI-SearchBot·PerplexityBot을 명시적으로 허용하고 sitemap 위치를 알려주는 편이 안전합니다.",
      weight: 20,
    });
  }

  /* 3. 제목 태그 */
  const title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ?? "";
  const titleLen = title.length;
  checks.push({
    id: "title",
    axis: "seo",
    name: "제목(title) 태그",
    detail: title
      ? `"${title.slice(0, 70)}${title.length > 70 ? "…" : ""}" · ${titleLen}자`
      : "제목 태그가 없습니다",
    status: !title ? "fail" : titleLen < 15 || titleLen > 65 ? "warn" : "pass",
    fix: !title
      ? "페이지 제목을 추가하세요. 검색과 AI가 페이지 주제를 파악하는 첫 번째 기준입니다."
      : titleLen < 15
        ? "제목이 짧습니다. 상호명과 함께 지역, 주요 진료·서비스 항목을 넣어 30~60자로 작성하세요."
        : titleLen > 65
          ? "제목이 길어 검색 결과에서 잘립니다. 30~60자로 줄이세요."
          : undefined,
    weight: 12,
  });

  /* 4. 메타 설명 */
  const description =
    firstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ??
    firstMatch(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  const descLen = description?.length ?? 0;
  checks.push({
    id: "description",
    axis: "seo",
    name: "메타 설명(description)",
    detail: description
      ? `${descLen}자 · "${description.slice(0, 60)}${description.length > 60 ? "…" : ""}"`
      : "메타 설명이 없습니다",
    status: !description ? "fail" : descLen < 50 || descLen > 160 ? "warn" : "pass",
    fix: !description
      ? "메타 설명을 추가하세요. AI가 페이지를 요약할 때 우선적으로 참고합니다."
      : descLen < 50
        ? "설명이 짧습니다. 주요 분야와 지역, 차별점이 드러나도록 80~150자로 작성하세요."
        : descLen > 160
          ? "설명이 길어 검색 결과에서 잘립니다. 150자 안쪽으로 줄이세요."
          : undefined,
    weight: 10,
  });

  /* 5. 구조화 데이터 */
  const ldBlocks =
    html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  const types = new Set<string>();
  for (const block of ldBlocks) {
    for (const t of block.match(/"@type"\s*:\s*"([^"]+)"/g) ?? []) {
      const match = t.match(/"@type"\s*:\s*"([^"]+)"/);
      if (match) types.add(match[1]);
    }
  }
  checks.push({
    id: "schema",
    axis: "geo",
    name: "구조화 데이터 (JSON-LD)",
    detail: ldBlocks.length
      ? `${ldBlocks.length}개 발견됨${types.size ? ` · ${[...types].slice(0, 5).join(", ")}` : ""}`
      : "구조화 데이터가 없습니다",
    status: !ldBlocks.length ? "fail" : types.size < 2 ? "warn" : "pass",
    fix: !ldBlocks.length
      ? "기관 정보, 담당자(의료진), FAQ를 JSON-LD로 표시하세요. AI가 상호명과 취급 분야를 오해 없이 인식하게 만드는 가장 확실한 방법입니다."
      : types.size < 2
        ? "구조화 데이터가 있지만 종류가 적습니다. 조직 정보, 담당자, FAQ를 함께 넣는 것을 권장합니다."
        : undefined,
    weight: 14,
  });

  /* 6. 제목 구조 */
  const h1 = countMatches(html, /<h1[\s>]/gi);
  const h2 = countMatches(html, /<h2[\s>]/gi);
  checks.push({
    id: "headings",
    axis: "seo",
    name: "제목 구조 (H1/H2)",
    detail: `H1 ${h1}개, H2 ${h2}개`,
    status: h1 === 0 || h2 < 2 ? "fail" : h1 > 1 ? "warn" : "pass",
    fix:
      h1 === 0
        ? "H1이 없습니다. 페이지의 주제를 담은 H1을 하나 두세요."
        : h1 > 1
          ? "H1이 여러 개입니다. H1은 페이지당 하나만 두고 나머지는 H2로 내리세요."
          : h2 < 2
            ? "H2가 부족합니다. 고객의 질문을 소제목으로 쓰면 AI가 문단 단위로 인용하기 쉬워집니다."
            : undefined,
    weight: 10,
  });

  /* 7. 서버 응답 텍스트량 */
  const text = visibleText(html);
  const textLength = text.length;
  checks.push({
    id: "text",
    axis: "aeo",
    name: "서버 응답에 포함된 텍스트 양",
    detail: `약 ${textLength.toLocaleString("ko-KR")}자`,
    status: textLength < 1000 ? "fail" : textLength < 3000 ? "warn" : "pass",
    fix:
      textLength < 1000
        ? "서버가 처음 보내는 HTML에 본문이 거의 없습니다. 자바스크립트로 내용을 그리는 구조라면 AI와 검색엔진이 읽을 문장이 없습니다. 서버 렌더링 적용을 검토하세요."
        : textLength < 3000
          ? "본문 텍스트가 적은 편입니다. 안내 정보와 자주 묻는 질문을 이미지가 아닌 글자로 넣으세요."
          : undefined,
    weight: 14,
  });

  /* 8. 사이트맵 */
  const hasSitemap =
    (sitemapResult.status === "fulfilled" &&
      sitemapResult.value.res.ok &&
      /<(urlset|sitemapindex)/i.test(sitemapResult.value.body)) ||
    (robotsTxt !== null && /^\s*sitemap\s*:/im.test(robotsTxt));
  checks.push({
    id: "sitemap",
    axis: "seo",
    name: "사이트맵(sitemap.xml)",
    detail: hasSitemap ? "sitemap이 정상 제공되고 있습니다" : "sitemap.xml을 찾을 수 없습니다",
    status: hasSitemap ? "pass" : "warn",
    fix: hasSitemap
      ? undefined
      : "sitemap.xml을 만들어 네이버 서치어드바이저와 구글 서치콘솔에 제출하세요. 새 페이지가 더 빨리 수집됩니다.",
    weight: 5,
  });

  /* 9. 이미지 대체 텍스트 */
  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  const missingAlt = imgs.filter((tag) => !/\balt\s*=\s*["'][^"']+["']/i.test(tag)).length;
  const missingRatio = imgs.length ? Math.round((missingAlt / imgs.length) * 100) : 0;
  checks.push({
    id: "alt",
    axis: "seo",
    name: "이미지 대체 텍스트(alt)",
    detail: imgs.length
      ? `이미지 ${imgs.length}개 중 ${missingAlt}개 누락 (${missingRatio}%)`
      : "이미지가 없습니다",
    status: !imgs.length ? "warn" : missingRatio > 50 ? "fail" : missingRatio > 20 ? "warn" : "pass",
    fix: !imgs.length
      ? "서버 응답에 이미지가 하나도 없습니다. 자바스크립트로 이미지를 넣는 구조라면 검색엔진이 이미지를 인식하지 못합니다."
      : missingRatio > 20
        ? "이미지에 alt를 채우세요. 안내 내용을 이미지로만 올린 경우 alt가 없으면 그 정보는 기계에게 존재하지 않습니다."
        : undefined,
    weight: 5,
  });

  /* 10. 소셜 미리보기 */
  const ogTitle = /property=["']og:title["']/i.test(html);
  const ogDesc = /property=["']og:description["']/i.test(html);
  const ogImage = /property=["']og:image["']/i.test(html);
  const ogCount = [ogTitle, ogDesc, ogImage].filter(Boolean).length;
  checks.push({
    id: "og",
    axis: "seo",
    name: "소셜 공유 정보 (OG 태그)",
    detail: `og:title, og:description, og:image 중 ${ogCount}개 설정됨`,
    status: ogCount === 3 ? "pass" : ogCount === 0 ? "fail" : "warn",
    fix:
      ogCount < 3
        ? "카카오톡이나 SNS에 링크를 공유할 때 표시되는 제목·설명·이미지입니다. 세 가지를 모두 채우세요."
        : undefined,
    weight: 5,
  });

  /* 11. canonical */
  const canonical = firstMatch(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  checks.push({
    id: "canonical",
    axis: "seo",
    name: "정식 주소(canonical) 지정",
    detail: canonical ? `지정됨 · ${canonical.slice(0, 60)}` : "canonical이 지정되지 않았습니다",
    status: canonical ? "pass" : "warn",
    fix: canonical
      ? undefined
      : "같은 내용이 여러 주소로 접근될 때 어느 쪽이 정식인지 알려주는 태그입니다. 중복 콘텐츠 판정을 피할 수 있습니다.",
    weight: 5,
  });

  /* 12. HTTPS */
  const isHttps = finalUrl.startsWith("https://");
  checks.push({
    id: "https",
    axis: "seo",
    name: "HTTPS 보안 연결",
    detail: isHttps ? "SSL 인증서가 적용되어 있습니다" : "http로 접속되고 있습니다",
    status: isHttps ? "pass" : "fail",
    fix: isHttps
      ? undefined
      : "SSL 인증서를 적용하세요. 브라우저가 '안전하지 않음'을 표시하면 방문자가 문의 전에 이탈합니다.",
    weight: 8,
  });

  /* 13. 모바일 뷰포트 */
  const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  checks.push({
    id: "viewport",
    axis: "seo",
    name: "모바일 뷰포트 설정",
    detail: hasViewport ? "모바일 최적화 설정이 있습니다" : "viewport 설정이 없습니다",
    status: hasViewport ? "pass" : "fail",
    fix: hasViewport
      ? undefined
      : "viewport 메타 태그가 없으면 휴대폰에서 화면이 축소되어 보입니다. 방문자의 대부분이 모바일입니다.",
    weight: 6,
  });

  /* 14. FAQ 구조화 데이터 */
  const hasFaqSchema = types.has("FAQPage") || /"@type"\s*:\s*"Question"/i.test(html);
  checks.push({
    id: "faq-schema",
    axis: "aeo",
    name: "FAQ 구조화 데이터 (FAQPage)",
    detail: hasFaqSchema ? "FAQPage 스키마가 적용되어 있습니다" : "FAQPage 스키마가 없습니다",
    status: hasFaqSchema ? "pass" : "fail",
    fix: hasFaqSchema
      ? undefined
      : "자주 묻는 질문을 FAQPage 스키마로 표시하세요. AI가 질문형 검색에 답할 때 가장 먼저 찾는 형식입니다.",
    weight: 25,
  });

  /* 15. 질문형 소제목 */
  const headingTexts = (html.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi) ?? []).map((h) =>
    h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  );
  const questionHeadings = headingTexts.filter((t) =>
    /\?|나요|까요|인가요|한가요|은가요|을까|무엇|어떻게|왜\s|언제|어디/.test(t)
  );
  checks.push({
    id: "question-headings",
    axis: "aeo",
    name: "질문형 소제목 구조",
    detail: headingTexts.length
      ? `H2·H3 ${headingTexts.length}개 중 질문형 ${questionHeadings.length}개`
      : "H2·H3 소제목이 없습니다",
    status: questionHeadings.length >= 5 ? "pass" : questionHeadings.length >= 2 ? "warn" : "fail",
    fix:
      questionHeadings.length >= 5
        ? undefined
        : "소제목을 고객의 질문 문장 그대로 쓰세요. 생성형 AI는 질문에 대응하는 소제목이 있는 문서를 우선 인용합니다. 페이지당 5개 이상을 권장합니다.",
    weight: 20,
  });

  /* 16. 인용 가능한 문단 구조 */
  const paragraphs = (html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) ?? [])
    .map((p) => p.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
    .filter((t) => t.length >= 50 && t.length <= 400);
  checks.push({
    id: "answer-blocks",
    axis: "aeo",
    name: "인용 가능한 문단 구조",
    detail: `50~400자 문단 ${paragraphs.length}개`,
    status: paragraphs.length >= 10 ? "pass" : paragraphs.length >= 3 ? "warn" : "fail",
    fix:
      paragraphs.length >= 10
        ? undefined
        : "AI는 문서 전체가 아니라 문단 단위로 잘라 인용합니다. 소제목 바로 아래에 두세 문장짜리 직접적인 답을 두고, 문단 안에서 상호명을 명시하세요.",
    weight: 20,
  });

  /* 17. 조직·의료기관 스키마 */
  const orgTypes = [
    "Organization",
    "LocalBusiness",
    "MedicalOrganization",
    "MedicalBusiness",
    "Hospital",
    "MedicalClinic",
    "Dentist",
    "Physician",
    "ProfessionalService",
  ];
  const foundOrg = orgTypes.filter((t) => types.has(t));
  checks.push({
    id: "org-schema",
    axis: "geo",
    name: "조직·의료기관 스키마",
    detail: foundOrg.length
      ? `${foundOrg.join(", ")} 적용됨`
      : "조직 스키마가 없습니다 — AI가 사이트 주체를 특정 기관으로 인식하기 어렵습니다",
    status: foundOrg.length ? "pass" : "fail",
    fix: foundOrg.length
      ? undefined
      : "MedicalOrganization(병원) 또는 LocalBusiness(일반 업체) 스키마로 상호명, 주소, 취급 분야, 영업시간, 전화번호를 표시하세요. AI가 '이 사이트는 어디인가'를 판단하는 기준입니다.",
    weight: 25,
  });

  /* 18. 엔티티 식별자 */
  const hasEntityId = /"@id"\s*:\s*"https?:\/\//i.test(html);
  checks.push({
    id: "entity-id",
    axis: "geo",
    name: "엔티티 고유 식별자 (@id)",
    detail: hasEntityId ? "@id 식별자가 설정되어 있습니다" : "@id 식별자가 없습니다",
    status: hasEntityId ? "pass" : "warn",
    fix: hasEntityId
      ? undefined
      : "구조화 데이터에 @id를 부여하면 여러 페이지의 정보가 같은 곳을 가리킨다는 것을 기계가 알 수 있습니다.",
    weight: 15,
  });

  /* 19. sameAs 외부 연결 */
  const hasSameAs = /"sameAs"/i.test(html);
  checks.push({
    id: "same-as",
    axis: "geo",
    name: "외부 채널 연결 (sameAs)",
    detail: hasSameAs
      ? "네이버 플레이스·블로그 등 외부 채널이 연결되어 있습니다"
      : "외부 채널 연결이 없습니다",
    status: hasSameAs ? "pass" : "warn",
    fix: hasSameAs
      ? undefined
      : "sameAs로 네이버 플레이스, 블로그, 인스타그램 주소를 연결하세요. 여러 출처에서 같은 곳임이 확인될수록 AI가 신뢰합니다.",
    weight: 15,
  });

  /* 20. 탐색 경로 */
  const hasBreadcrumb = types.has("BreadcrumbList");
  checks.push({
    id: "breadcrumb",
    axis: "geo",
    name: "탐색 경로 (BreadcrumbList)",
    detail: hasBreadcrumb ? "BreadcrumbList가 적용되어 있습니다" : "BreadcrumbList가 없습니다",
    status: hasBreadcrumb ? "pass" : "warn",
    fix: hasBreadcrumb
      ? undefined
      : "페이지의 위치를 알려주는 구조입니다. 검색 결과에 경로가 함께 표시되고 AI가 사이트 구조를 파악하기 쉬워집니다.",
    weight: 10,
  });

  /* 21. 네이버 서치어드바이저 */
  const naverVerified = /naver-site-verification/i.test(html);
  checks.push({
    id: "naver-verify",
    axis: "naver",
    name: "네이버 서치어드바이저 등록",
    detail: naverVerified
      ? "네이버 사이트 소유 확인이 되어 있습니다"
      : "네이버 서치어드바이저 인증 태그가 없습니다",
    status: naverVerified ? "pass" : "fail",
    fix: naverVerified
      ? undefined
      : "네이버 서치어드바이저에 사이트를 등록하고 사이트맵을 제출하세요. 등록하지 않으면 네이버 검색에 수집되는 속도가 크게 느려집니다.",
    weight: 30,
  });

  /* 22. 한국어 언어 속성 */
  const langAttr = firstMatch(html, /<html[^>]+lang=["']([^"']+)["']/i);
  const isKo = Boolean(langAttr && /^ko/i.test(langAttr));
  checks.push({
    id: "lang-ko",
    axis: "naver",
    name: '한국어 언어 속성 (lang="ko")',
    detail: langAttr ? `lang="${langAttr}"` : "lang 속성이 없습니다",
    status: isKo ? "pass" : "fail",
    fix: isKo
      ? undefined
      : '<html lang="ko">를 지정하세요. 검색엔진과 AI가 한국어 문서로 인식하는 기본 신호입니다.',
    weight: 15,
  });

  /* 23. 한국어 콘텐츠 분량 */
  const hangulCount = (text.match(/[가-힣]/g) ?? []).length;
  checks.push({
    id: "korean-content",
    axis: "naver",
    name: "한국어 콘텐츠 분량",
    detail: `한글 ${hangulCount.toLocaleString("ko-KR")}자`,
    status: hangulCount >= 1500 ? "pass" : hangulCount >= 500 ? "warn" : "fail",
    fix:
      hangulCount >= 1500
        ? undefined
        : "한국어 본문이 부족합니다. 안내 정보와 자주 묻는 질문을 이미지가 아닌 글자로 넣으세요.",
    weight: 15,
  });

  /* 24. 네이버 크롤러 허용 */
  const naverBlocked =
    robotsTxt !== null &&
    (isAgentBlocked(robotsTxt, "Yeti") || isAgentBlocked(robotsTxt, "NaverBot"));
  checks.push({
    id: "naver-crawler",
    axis: "naver",
    name: "네이버 크롤러(Yeti) 허용",
    detail: naverBlocked
      ? "robots.txt에서 네이버 크롤러가 차단되어 있습니다"
      : "네이버 크롤러 수집이 가능합니다",
    status: naverBlocked ? "fail" : "pass",
    fix: naverBlocked
      ? "robots.txt에서 Yeti의 Disallow 규칙을 제거하세요. 차단된 상태로는 네이버 검색에 노출되지 않습니다."
      : undefined,
    weight: 25,
  });

  /* 25. 공유 언어 설정 */
  const ogLocale = /og:locale["'][^>]*content=["']ko/i.test(html);
  checks.push({
    id: "og-locale",
    axis: "naver",
    name: "공유 언어 설정 (og:locale)",
    detail: ogLocale ? "ko_KR로 설정되어 있습니다" : "og:locale이 없거나 한국어가 아닙니다",
    status: ogLocale ? "pass" : "warn",
    fix: ogLocale
      ? undefined
      : "og:locale을 ko_KR로 지정하면 카카오톡·네이버에서 링크를 공유할 때 한국어 문서로 정확히 처리됩니다.",
    weight: 15,
  });

  const { axes, score } = scoreChecks(checks);

  return {
    url: target.href,
    finalUrl,
    title,
    score,
    grade: gradeOf(score),
    responseMs,
    axes,
    checks,
    priorities: pickPriorities(checks),
    error: null,
  };
}

/** AI 코멘트 프롬프트에 넣을 진단 요약 텍스트 */
export function diagnosisSummary(site: SiteDiagnosis): string {
  if (site.error) return `URL: ${site.url}\n(진단 실패: ${site.error})`;

  const axisLine = site.axes.map((a) => `${AXIS_META[a.axis].short} ${a.score}점`).join(" · ");
  const checkLines = site.checks
    .map((c) => `- [${c.status.toUpperCase()}] ${c.name}: ${c.detail}`)
    .join("\n");

  return `URL: ${site.finalUrl}
제목: ${site.title || "(없음)"}
총점: ${site.score}점 (${site.grade}) · ${axisLine}

체크리스트 결과 (25항목):
${checkLines}`;
}
