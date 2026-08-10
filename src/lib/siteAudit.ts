import "server-only";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ANALYSIS_MODEL = process.env.ANALYSIS_MODEL || "gpt-4o-mini";

export type CheckStatus = "pass" | "warn" | "fail";
export type Check = { key: string; label: string; status: CheckStatus; detail: string };

export type SiteAuditResult = {
  url: string;
  finalUrl: string;
  checks: Check[];
  aiComment: string | null;
};

const AI_BOT_NAMES = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "Google-Extended",
  "PerplexityBot",
  "ClaudeBot",
  "anthropic-ai",
  "CCBot",
];

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MediExposureSiteAudit/1.0)" },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function checkRobots(origin: string): Promise<Check> {
  try {
    const res = await fetchWithTimeout(`${origin}/robots.txt`, 8000);
    if (!res.ok) {
      return { key: "robots", label: "AI 크롤러 차단 여부", status: "pass", detail: "robots.txt 없음 (기본적으로 크롤링 허용)" };
    }
    const text = await res.text();
    const lines = text.split("\n").map((l) => l.trim());
    const blocked: string[] = [];

    let currentAgents: string[] = [];
    for (const line of lines) {
      const uaMatch = line.match(/^user-agent:\s*(.+)$/i);
      if (uaMatch) {
        currentAgents = [uaMatch[1].trim()];
        continue;
      }
      const disallowMatch = line.match(/^disallow:\s*(.*)$/i);
      if (disallowMatch && disallowMatch[1].trim() === "/") {
        for (const agent of currentAgents) {
          const matchedBot = AI_BOT_NAMES.find((bot) => bot.toLowerCase() === agent.toLowerCase());
          if (matchedBot) blocked.push(matchedBot);
        }
      }
    }

    if (blocked.length > 0) {
      return {
        key: "robots",
        label: "AI 크롤러 차단 여부",
        status: "fail",
        detail: `robots.txt에서 ${blocked.join(", ")}를 차단하고 있어 AI가 이 사이트를 읽을 수 없습니다.`,
      };
    }
    return { key: "robots", label: "AI 크롤러 차단 여부", status: "pass", detail: "주요 AI 크롤러가 차단되어 있지 않습니다." };
  } catch {
    return { key: "robots", label: "AI 크롤러 차단 여부", status: "warn", detail: "robots.txt를 확인하지 못했습니다." };
  }
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function runSiteAudit(rawUrl: string): Promise<SiteAuditResult> {
  const url = normalizeUrl(rawUrl);
  const parsed = new URL(url);

  const checks: Check[] = [];
  let html = "";
  let finalUrl = url;

  try {
    const res = await fetchWithTimeout(url, 12000);
    finalUrl = res.url || url;
    html = await res.text();
    checks.push(
      res.ok
        ? { key: "reachable", label: "페이지 접근 가능 여부", status: "pass", detail: `정상 응답 (HTTP ${res.status})` }
        : { key: "reachable", label: "페이지 접근 가능 여부", status: "fail", detail: `HTTP ${res.status} 응답` }
    );
  } catch (err) {
    checks.push({
      key: "reachable",
      label: "페이지 접근 가능 여부",
      status: "fail",
      detail: `페이지를 불러오지 못했습니다: ${err instanceof Error ? err.message : String(err)}`,
    });
    checks.push(await checkRobots(parsed.origin));
    return { url, finalUrl, checks, aiComment: null };
  }

  checks.push(await checkRobots(parsed.origin));

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "";
  checks.push(
    title
      ? { key: "title", label: "제목(title) 태그", status: "pass", detail: `"${title}"` }
      : { key: "title", label: "제목(title) 태그", status: "fail", detail: "title 태그가 없거나 비어 있습니다." }
  );

  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
  const description = descMatch ? descMatch[1].trim() : "";
  checks.push(
    description
      ? { key: "description", label: "메타 설명(description)", status: "pass", detail: `"${description}"` }
      : { key: "description", label: "메타 설명(description)", status: "warn", detail: "meta description이 없습니다." }
  );

  const jsonLdCount = (html.match(/<script[^>]+type=["']application\/ld\+json["']/gi) ?? []).length;
  checks.push(
    jsonLdCount > 0
      ? { key: "structured", label: "구조화 데이터 (JSON-LD)", status: "pass", detail: `${jsonLdCount}개 발견됨` }
      : { key: "structured", label: "구조화 데이터 (JSON-LD)", status: "warn", detail: "구조화 데이터(schema.org)가 없습니다." }
  );

  const h1Count = (html.match(/<h1[\s>]/gi) ?? []).length;
  const h2Count = (html.match(/<h2[\s>]/gi) ?? []).length;
  checks.push(
    h1Count > 0
      ? { key: "headings", label: "제목 구조 (H1/H2)", status: "pass", detail: `H1 ${h1Count}개, H2 ${h2Count}개` }
      : { key: "headings", label: "제목 구조 (H1/H2)", status: "warn", detail: "H1 태그가 없습니다." }
  );

  const visibleText = stripTags(html);
  checks.push(
    visibleText.length > 300
      ? { key: "content", label: "서버 응답에 포함된 텍스트 양", status: "pass", detail: `약 ${visibleText.length}자` }
      : {
          key: "content",
          label: "서버 응답에 포함된 텍스트 양",
          status: "fail",
          detail: `약 ${visibleText.length}자 — 자바스크립트로 콘텐츠를 그리는 사이트일 가능성이 높아 AI가 내용을 거의 못 읽을 수 있습니다.`,
        }
  );

  let aiComment: string | null = null;
  try {
    const summaryForAi = `제목: ${title || "(없음)"}
설명: ${description || "(없음)"}
본문 일부: ${visibleText.slice(0, 1500)}`;

    const completion = await openai.chat.completions.create({
      model: ANALYSIS_MODEL,
      messages: [
        {
          role: "system",
          content:
            "너는 웹사이트가 ChatGPT나 Gemini 같은 AI 검색엔진에 얼마나 잘 노출/인용될 수 있는지 진단하는 전문가다. 아래 페이지 정보를 보고, 부족한 점과 개선 방향을 마케팅 담당자가 이해할 수 있도록 한국어로 3~4문장 이내로 간결하게 답하라.",
        },
        { role: "user", content: summaryForAi },
      ],
    });
    aiComment = completion.choices[0]?.message?.content ?? null;
  } catch {
    aiComment = null;
  }

  return { url, finalUrl, checks, aiComment };
}
