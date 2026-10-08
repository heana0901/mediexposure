import { AXIS_META, type CheckResult, type SiteDiagnosis } from "./diagnose-shared";
import type { ContentPrescription, LocationCheck } from "./types";

/**
 * 홈페이지 제작·관리 담당자에게 넘기는 '수정 요청서'의 내용.
 *
 * 진단 결과(어떤 항목이 왜 문제인지)를 개발자가 그대로 작업할 수 있는 지시로 바꾼다:
 * 왜 중요한지 · 무엇을 하면 되는지 · 병원 정보를 채운 예시 코드 · 끝났는지 확인하는 법.
 * 모르는 값은 {{전화번호}}처럼 비워 두고, 지어내지 않는다.
 */
export type FixContext = {
  hospitalName: string;
  siteUrl: string;
  region?: string | null;
  department?: string | null;
  aliases?: string[];
  naverBlogUrl?: string | null;
  isClinic?: boolean;
  /** 네이버 플레이스로 확인한 실제 위치. 있으면 예시 코드의 주소·좌표를 채운다 */
  place?: LocationCheck["actual"];
};

type Guide = {
  why: string;
  steps: string[];
  code?: (ctx: Required<Pick<FixContext, "hospitalName">> & FixContext & { origin: string; domain: string }) => string;
  verify: string;
};

function originOf(url: string): { origin: string; domain: string } {
  try {
    const u = new URL(/^https?:\/\//.test(url) ? url : `https://${url}`);
    return { origin: `${u.protocol}//${u.host}`, domain: u.host.replace(/^www\./, "") };
  } catch {
    return { origin: "https://{{홈페이지 주소}}", domain: "{{홈페이지 주소}}" };
  }
}

const ROBOTS = (origin: string) => `# robots.txt — 사이트 맨 위 경로(${origin}/robots.txt)에 둡니다
User-agent: *
Allow: /

# AI 검색·답변 서비스 (차단하면 AI가 홈페이지 내용을 인용하지 못합니다)
User-agent: OAI-SearchBot
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: GPTBot
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Perplexity-User
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Claude-User
Allow: /
User-agent: Google-Extended
Allow: /

# 네이버 검색
User-agent: Yeti
Allow: /

Sitemap: ${origin}/sitemap.xml`;

const GUIDES: Record<string, Guide> = {
  reachable: {
    why: "검색엔진과 AI가 페이지를 열지 못하면 다른 모든 항목이 의미가 없습니다.",
    steps: [
      "서버가 검색엔진·AI 수집기 요청에 200 응답을 주는지 확인합니다(방화벽·국가 차단·봇 차단 설정 점검).",
      "robots.txt에서 사이트 전체를 막는 Disallow: / 가 있는지 확인합니다.",
    ],
    code: ({ origin }) => ROBOTS(origin),
    verify: "PC에서 주소창에 사이트를 열고, 휴대폰 데이터망에서도 열리는지 확인합니다. 아래 예시의 robots.txt가 사이트에서 보이면 됩니다.",
  },
  "ai-crawler": {
    why: "ChatGPT·Perplexity·Claude 등이 홈페이지를 읽지 못하면, 답변에서 병원을 소개할 때 홈페이지를 출처로 쓰지 못합니다. 실제로 홈페이지가 인용된 AI 답변에서는 병원 추천 확률이 크게 높았습니다.",
    steps: [
      "robots.txt에서 아래 AI 수집기들의 Disallow 규칙을 지우고 Allow로 바꿉니다.",
      "보안 플러그인·방화벽(Cloudflare 등)의 '봇 차단'에서 이 이름들이 막혀 있지 않은지 확인합니다.",
    ],
    code: ({ origin }) => ROBOTS(origin),
    verify: "브라우저에서 /robots.txt를 열어 위 내용이 그대로 보이는지 확인합니다.",
  },
  "naver-crawler": {
    why: "네이버 검색로봇(Yeti)이 막혀 있으면 네이버 검색과 네이버 AI 브리핑에 홈페이지가 나오지 않습니다.",
    steps: ["robots.txt에서 Yeti를 허용합니다(아래 예시 참고)."],
    code: ({ origin }) => ROBOTS(origin),
    verify: "네이버 서치어드바이저 > 웹마스터 도구 > 사이트 진단 > robots.txt에서 '수집 가능'으로 나오는지 확인합니다.",
  },
  title: {
    why: "검색 결과와 AI 답변이 페이지를 소개할 때 가장 먼저 쓰는 문장입니다. 병원명·지역·대표 진료가 들어가야 합니다.",
    steps: [
      "페이지마다 다른 제목을 씁니다(메인은 병원 대표 소개, 진료 페이지는 그 진료명).",
      "'대표 진료 | 지역 병원명' 형식으로 30~60자 이내로 씁니다.",
    ],
    code: ({ hospitalName, region, department }) =>
      `<title>${department ?? "{{대표 진료}}"} | ${shortRegion(region)} ${hospitalName}</title>`,
    verify: "브라우저 탭에 마우스를 올렸을 때 위 제목이 보이면 됩니다.",
  },
  description: {
    why: "검색 결과 아래 설명과 AI가 페이지를 요약할 때 참고하는 문장입니다.",
    steps: [
      "페이지마다 80~150자로, 병원명·지역·진료 내용·차별점을 한 문장씩 담습니다.",
      "키워드를 나열하지 말고 환자에게 설명하듯 씁니다.",
    ],
    code: ({ hospitalName, region, department }) =>
      `<meta name="description" content="${shortRegion(region)} ${hospitalName}은(는) ${department ?? "{{진료과}}"} 진료를 하는 의료기관입니다. {{대표 진료와 차별점 한 문장}} 진료시간·위치·예약 방법을 안내합니다.">`,
    verify: "페이지에서 마우스 오른쪽 > 페이지 소스 보기 > description을 검색해 내용이 있는지 확인합니다.",
  },
  schema: {
    why: "구조화 데이터(JSON-LD)는 검색엔진과 AI가 '이 사이트는 어느 병원의 것인지, 어디에 있고 무엇을 하는지'를 기계적으로 읽는 표준입니다.",
    steps: ["모든 페이지의 <head> 안에 아래 의료기관 JSON-LD를 넣습니다. {{ }} 부분은 실제 값으로 바꿉니다."],
    code: (ctx) => hospitalJsonLd(ctx),
    verify: "https://validator.schema.org 에 페이지 주소를 넣어 Hospital(또는 MedicalClinic)이 오류 없이 인식되는지 확인합니다.",
  },
  "org-schema": {
    why: "AI는 병원을 하나의 '개체'로 인식해야 답변에 정확한 이름·주소로 소개합니다. 의료기관 스키마가 그 신분증 역할을 합니다.",
    steps: ["@type을 Hospital(병원) 또는 MedicalClinic(의원)으로 지정한 JSON-LD를 넣습니다."],
    code: (ctx) => hospitalJsonLd(ctx),
    verify: "https://validator.schema.org 에서 @type이 Hospital/MedicalClinic으로 나오는지 확인합니다.",
  },
  "entity-id": {
    why: "@id는 여러 페이지의 정보가 같은 병원에 관한 것임을 묶어 줍니다. 없으면 AI가 페이지마다 다른 기관으로 볼 수 있습니다.",
    steps: ["의료기관 JSON-LD에 \"@id\": \"홈페이지주소/#hospital\" 을 넣고, 모든 페이지에서 같은 값을 씁니다."],
    code: (ctx) => hospitalJsonLd(ctx),
    verify: "여러 페이지의 JSON-LD에서 @id 값이 모두 같은지 확인합니다.",
  },
  "same-as": {
    why: "sameAs로 네이버 블로그·플레이스·유튜브·인스타그램을 연결하면, AI가 여러 채널의 정보를 같은 병원으로 합쳐 신뢰도를 높게 봅니다.",
    steps: ["의료기관 JSON-LD의 sameAs에 병원이 운영하는 공식 채널 주소를 모두 넣습니다."],
    code: (ctx) => hospitalJsonLd(ctx),
    verify: "JSON-LD 안 sameAs 목록에 공식 채널이 모두 들어 있는지 확인합니다.",
  },
  "faq-schema": {
    why: "자주 묻는 질문을 FAQPage로 표시하면 AI가 질문-답 단위로 그대로 인용하기 쉽습니다.",
    steps: [
      "진료 페이지 하단에 실제 환자 질문 5~10개와 2~3문장 답변을 화면에 보이게 씁니다.",
      "같은 내용을 FAQPage JSON-LD로 함께 넣습니다(화면 내용과 똑같아야 합니다).",
    ],
    code: ({ hospitalName }) => `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "{{질문 1 — 예: 척추내시경 수술 후 입원은 며칠인가요?}}",
      "acceptedAnswer": { "@type": "Answer", "text": "${hospitalName}에서는 {{답변 2~3문장}}" }
    },
    {
      "@type": "Question",
      "name": "{{질문 2 — 예: 비용은 보험이 되나요?}}",
      "acceptedAnswer": { "@type": "Answer", "text": "{{답변 2~3문장}}" }
    }
  ]
}
</script>`,
    verify: "Google 리치 결과 테스트(https://search.google.com/test/rich-results)에서 'FAQ'가 인식되는지 확인합니다.",
  },
  breadcrumb: {
    why: "탐색 경로(BreadcrumbList)는 페이지가 사이트 안 어디에 있는지 알려 주어 검색엔진이 구조를 이해하게 합니다.",
    steps: ["진료 페이지마다 '홈 > 진료과 > 진료명' 경로를 JSON-LD로 넣습니다."],
    code: ({ origin }) => `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "홈", "item": "${origin}/" },
    { "@type": "ListItem", "position": 2, "name": "{{진료과}}", "item": "${origin}/{{진료과 경로}}" },
    { "@type": "ListItem", "position": 3, "name": "{{진료명}}", "item": "${origin}/{{진료 페이지 경로}}" }
  ]
}
</script>`,
    verify: "Google 리치 결과 테스트에서 '탐색경로'가 인식되는지 확인합니다.",
  },
  headings: {
    why: "H1·H2 제목 구조는 검색엔진과 AI가 페이지 주제와 단락을 나누는 기준입니다.",
    steps: [
      "페이지마다 H1은 하나만, 그 페이지의 주제(예: '안산 척추내시경 — 병원명')로 씁니다.",
      "본문 단락마다 H2 소제목을 붙입니다. 로고·메뉴에는 H 태그를 쓰지 않습니다.",
    ],
    code: ({ hospitalName, region }) => `<h1>${shortRegion(region)} {{진료명}} — ${hospitalName}</h1>
<h2>{{진료명}}이란 무엇인가요?</h2>
<p>...</p>
<h2>어떤 분에게 필요한가요?</h2>
<p>...</p>`,
    verify: "페이지 소스에서 <h1>이 한 번만 나오는지, 본문에 <h2>가 여러 개 있는지 확인합니다.",
  },
  "question-headings": {
    why: "AI는 사용자의 질문과 비슷한 소제목 아래 문단을 답변으로 가져갑니다. 소제목을 환자가 실제로 묻는 질문 문장으로 쓰면 인용될 확률이 높아집니다.",
    steps: ["진료 페이지의 H2를 질문 문장으로 바꿉니다(페이지당 6~10개)."],
    code: ({ hospitalName }) => `<h2>{{진료명}}은 꼭 수술해야 하나요?</h2>
<p>${hospitalName}은(는) {{40~80자 직답}}</p>
<h2>{{진료명}} 비용은 보험이 되나요?</h2>
<p>{{40~80자 직답}}</p>`,
    verify: "진료 페이지에 '?'로 끝나는 H2가 여러 개 있는지 확인합니다.",
  },
  "answer-blocks": {
    why: "AI는 문단을 잘라서 인용합니다. 소제목 바로 아래 첫 문단이 혼자 떨어져도 뜻이 통해야 그대로 쓰입니다.",
    steps: [
      "각 H2 바로 아래 첫 문단을 40~80자 핵심 답으로 씁니다. 자세한 설명은 그다음 문단에 둡니다.",
      "'저희는' 대신 병원 이름을 주어로 씁니다(문단만 떼어 봐도 어느 병원 이야기인지 알 수 있게).",
    ],
    code: ({ hospitalName }) => `<h2>{{질문}}</h2>
<p>${hospitalName}은(는) {{핵심 답 40~80자}}</p>
<p>{{자세한 설명}}</p>`,
    verify: "각 소제목 아래 첫 문장만 읽어도 답이 되는지 확인합니다.",
  },
  text: {
    why: "검색엔진과 AI는 서버가 처음 보내는 HTML의 글자만 읽습니다. 글이 이미지 안에 있거나 자바스크립트로 나중에 그려지면 내용이 없는 페이지로 보입니다.",
    steps: [
      "진료 설명을 이미지가 아닌 HTML 텍스트로 넣습니다(디자인 이미지는 그대로 두고 설명 글을 텍스트로 추가).",
      "자바스크립트로 그리는 사이트라면 서버 렌더링(SSR) 또는 미리 렌더링을 적용합니다.",
      "주요 진료 페이지는 본문 텍스트 1,500자 이상을 목표로 합니다.",
    ],
    verify: "페이지 소스 보기(Ctrl+U)에서 진료 설명 문장이 그대로 검색되는지 확인합니다.",
  },
  "korean-content": {
    why: "네이버는 한국어 본문이 충분한 페이지를 우선 노출합니다.",
    steps: ["주요 페이지에 한국어 설명 텍스트를 충분히(1,000자 이상) 넣습니다. 이미지 속 글은 계산되지 않습니다."],
    verify: "페이지 소스 보기에서 한국어 본문이 텍스트로 들어 있는지 확인합니다.",
  },
  sitemap: {
    why: "사이트맵은 검색엔진·AI 수집기에 페이지 목록을 알려 주어 새 페이지가 빨리 수집되게 합니다.",
    steps: [
      "/sitemap.xml을 만들고 모든 공개 페이지 주소와 수정일(lastmod)을 넣습니다.",
      "robots.txt 마지막 줄에 Sitemap 주소를 적습니다.",
      "네이버 서치어드바이저와 Google Search Console, Bing 웹마스터 도구에 사이트맵을 제출합니다.",
    ],
    code: ({ origin }) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${origin}/</loc><lastmod>{{YYYY-MM-DD}}</lastmod></url>
  <url><loc>${origin}/{{진료 페이지 경로}}</loc><lastmod>{{YYYY-MM-DD}}</lastmod></url>
</urlset>`,
    verify: "브라우저에서 /sitemap.xml이 열리고, 각 검색엔진 도구에서 '제출 성공'으로 나오는지 확인합니다.",
  },
  alt: {
    why: "이미지 대체 텍스트(alt)는 검색엔진·AI가 이미지 내용을 이해하는 유일한 방법입니다.",
    steps: ["의미 있는 이미지마다 무엇을 보여주는지 한 문장으로 alt를 씁니다. 장식용 이미지는 alt=\"\"로 둡니다."],
    code: ({ hospitalName }) => `<img src="..." alt="${hospitalName} {{장비명 또는 진료 장면 설명}}">`,
    verify: "페이지 소스에서 <img 태그마다 alt 내용이 있는지 확인합니다.",
  },
  og: {
    why: "카카오톡·블로그 등에 링크를 공유할 때 보이는 제목·설명·이미지입니다. 일부 AI도 페이지 요약에 참고합니다.",
    steps: ["모든 페이지 <head>에 OG 태그를 넣습니다(페이지별 제목·설명)."],
    code: ({ hospitalName, origin }) => `<meta property="og:type" content="website">
<meta property="og:title" content="{{페이지 제목}} | ${hospitalName}">
<meta property="og:description" content="{{페이지 설명 80~150자}}">
<meta property="og:image" content="${origin}/{{대표 이미지 경로, 1200x630}}">
<meta property="og:url" content="${origin}/{{현재 페이지 경로}}">
<meta property="og:locale" content="ko_KR">`,
    verify: "카카오톡 나에게 보내기로 링크를 보내 제목·이미지가 제대로 나오는지 확인합니다.",
  },
  "og-locale": {
    why: "공유 정보의 언어를 한국어로 지정해 국내 서비스가 올바르게 인식하게 합니다.",
    steps: ["<head>에 og:locale을 ko_KR로 넣습니다."],
    code: () => `<meta property="og:locale" content="ko_KR">`,
    verify: "페이지 소스에서 og:locale을 검색해 ko_KR이 있는지 확인합니다.",
  },
  canonical: {
    why: "같은 내용이 여러 주소(www 유무, ?파라미터 등)로 열리면 점수가 나뉩니다. 정식 주소를 하나로 알려 줍니다.",
    steps: ["모든 페이지 <head>에 그 페이지의 정식 주소를 canonical로 넣습니다."],
    code: ({ origin }) => `<link rel="canonical" href="${origin}/{{현재 페이지 경로}}">`,
    verify: "페이지 소스에서 rel=\"canonical\"을 검색해 자기 주소가 들어 있는지 확인합니다.",
  },
  https: {
    why: "HTTPS가 아니면 브라우저가 '안전하지 않음'을 표시하고 검색 순위에서도 불리합니다.",
    steps: ["SSL 인증서를 적용하고, http:// 로 들어오면 https:// 로 301 이동시킵니다."],
    verify: "주소창에 http://로 입력했을 때 자동으로 https://로 바뀌는지 확인합니다.",
  },
  viewport: {
    why: "모바일 뷰포트가 없으면 휴대폰에서 화면이 작게 보이고 모바일 검색에서 불리합니다. 이 병원 방문자의 대부분은 모바일입니다.",
    steps: ["<head>에 viewport 메타 태그를 넣고 모바일 화면을 점검합니다."],
    code: () => `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    verify: "휴대폰에서 사이트를 열어 글자가 확대 없이 읽히는지 확인합니다.",
  },
  "naver-verify": {
    why: "네이버 서치어드바이저에 등록해야 네이버가 사이트를 공식적으로 수집하고, 사이트맵 제출·수집 오류 확인이 가능합니다.",
    steps: [
      "https://searchadvisor.naver.com 에서 사이트를 등록하고 소유 확인용 메타 태그를 받습니다.",
      "메인 페이지 <head>에 받은 메타 태그를 넣고 '소유 확인'을 누릅니다.",
      "사이트맵(/sitemap.xml)과 RSS를 제출합니다.",
    ],
    code: () => `<meta name="naver-site-verification" content="{{서치어드바이저에서 받은 값}}">`,
    verify: "서치어드바이저 사이트 목록에 '확인 완료'로 나오는지 확인합니다.",
  },
  "lang-ko": {
    why: "페이지 언어를 한국어로 지정해야 검색엔진이 국내 사용자에게 맞게 보여 줍니다.",
    steps: ["<html> 태그에 lang=\"ko\"를 넣습니다."],
    code: () => `<html lang="ko">`,
    verify: "페이지 소스 첫 줄 근처에서 <html lang=\"ko\">를 확인합니다.",
  },
};

function shortRegion(region?: string | null): string {
  const tokens = (region ?? "").split(/\s+/).filter((t) => /(시|군|구)$/.test(t));
  const city = tokens.find((t) => /시$/.test(t)) ?? tokens[0];
  return city ? city.replace(/(특별시|광역시|시)$/, "") : "{{지역}}";
}

/** "경기도 안산시 단원구 광덕대로 181 BYC빌딩 2층" → 시·도 / 시·군·구 / 나머지 도로명 주소 */
function splitAddress(road: string): { region: string; locality: string; street: string } {
  const tokens = road.split(/\s+/).filter(Boolean);
  const region = /(도|특별시|광역시|특별자치시|특별자치도)$/.test(tokens[0] ?? "") ? tokens.shift()! : "";
  const locality: string[] = [];
  while (tokens.length && /(시|군|구)$/.test(tokens[0])) locality.push(tokens.shift()!);
  return { region, locality: locality.join(" "), street: tokens.join(" ") };
}

function postalAddressJson(ctx: FixContext): string {
  const road = ctx.place?.roadAddress;
  if (!road) {
    return `"address": {
    "@type": "PostalAddress",
    "streetAddress": "${ctx.region ?? "{{도로명 주소}}"}",
    "addressCountry": "KR"
  }`;
  }
  const { region, locality, street } = splitAddress(road);
  const geo =
    ctx.place?.lat && ctx.place?.lng
      ? `,
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": ${ctx.place.lat.toFixed(6)},
    "longitude": ${ctx.place.lng.toFixed(6)}
  }`
      : "";
  return `"address": {
    "@type": "PostalAddress",
    "streetAddress": "${street}",
    "addressLocality": "${locality}",
    "addressRegion": "${region}",
    "addressCountry": "KR"
  }${geo}`;
}

function hospitalJsonLd(ctx: FixContext & { hospitalName: string; origin: string }): string {
  const sameAs = [ctx.naverBlogUrl || null, "{{네이버 플레이스 주소}}", "{{유튜브 채널 주소}}", "{{인스타그램 주소}}"]
    .filter(Boolean)
    .map((s) => `    "${s}"`)
    .join(",\n");
  const alternate = (ctx.aliases ?? []).length
    ? `\n  "alternateName": [${(ctx.aliases ?? []).map((a) => `"${a}"`).join(", ")}],`
    : "";
  return `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "${ctx.isClinic ? "MedicalClinic" : "Hospital"}",
  "@id": "${ctx.origin}/#hospital",
  "name": "${ctx.hospitalName}",${alternate}
  "url": "${ctx.origin}/",
  "telephone": "{{대표 전화번호}}",
  ${postalAddressJson(ctx)},
  "medicalSpecialty": "${ctx.department ?? "{{진료과}}"}",
  "openingHours": "{{예: Mo-Fr 09:00-18:00}}",
  "sameAs": [
${sameAs}
  ]
}
</script>`;
}

export type FixItem = {
  check: CheckResult;
  axisLabel: string;
  /** 이 항목을 '이상 없음'으로 고치면 오르는 종합 점수(최대) */
  gain: number;
  why: string;
  steps: string[];
  code: string | null;
  verify: string;
};

/** 고칠 항목을 '꼭 고칠 것' → '손볼 곳', 같은 단계 안에서는 오르는 점수 순으로 */
export function buildFixItems(diagnosis: SiteDiagnosis, ctx: FixContext): FixItem[] {
  const { origin, domain } = originOf(diagnosis.finalUrl || diagnosis.url || ctx.siteUrl);
  const axisWeightTotal = new Map<string, number>();
  for (const c of diagnosis.checks) axisWeightTotal.set(c.axis, (axisWeightTotal.get(c.axis) ?? 0) + c.weight);

  return diagnosis.checks
    .filter((c) => c.status !== "pass")
    .map((check) => {
      const guide = GUIDES[check.id];
      const lost = check.status === "fail" ? 1 : 0.5;
      const gain = (lost * check.weight * AXIS_META[check.axis].weight) / (axisWeightTotal.get(check.axis) || 1);
      return {
        check,
        axisLabel: AXIS_META[check.axis].short,
        gain: Math.round(gain * 10) / 10,
        why: guide?.why ?? "",
        steps: guide?.steps ?? (check.fix ? [check.fix] : []),
        code: guide?.code ? guide.code({ ...ctx, origin, domain }) : null,
        verify: guide?.verify ?? "수정 후 AI analytics에서 다시 분석해 '이상 없음'으로 바뀌는지 확인합니다.",
      };
    })
    .sort((a, b) => (a.check.status === "fail" ? 0 : 1) - (b.check.status === "fail" ? 0 : 1) || b.gain - a.gain);
}

/** 진단 항목에는 없지만 AI 노출에 도움이 되는 추가 권장 작업 */
export function extraRecommendations(ctx: FixContext): { title: string; why: string; steps: string[]; code?: string }[] {
  const { origin } = originOf(ctx.siteUrl);
  return [
    {
      title: "Bing 웹마스터 도구 등록",
      why: "ChatGPT 검색 등 일부 AI 검색은 Bing 검색 색인을 함께 활용합니다. 구글에는 잘 나오는데 ChatGPT 답변에서 약하다면 Bing에 페이지가 수집되지 않았을 가능성이 있습니다.",
      steps: [
        "https://www.bing.com/webmasters 에서 사이트를 추가합니다(Google Search Console에서 가져오기 가능).",
        "사이트맵을 제출하고, 'URL 검사'로 주요 진료 페이지가 색인됐는지 확인합니다.",
      ],
    },
    {
      title: "llms.txt 추가 (선택)",
      why: "AI 수집기가 사이트 요약을 찾을 때 요청하는 파일입니다(아직 표준화 단계). 병원 소개와 주요 페이지 목록을 간단히 적어 둡니다.",
      steps: ["사이트 맨 위 경로에 llms.txt 텍스트 파일을 올립니다."],
      code: `# ${ctx.hospitalName}
> ${shortRegion(ctx.region)} ${ctx.department ?? "{{진료과}}"} 진료 의료기관. {{한 줄 소개}}

## 주요 안내
- [진료 안내](${origin}/{{진료 페이지 경로}})
- [의료진 소개](${origin}/{{의료진 페이지 경로}})
- [오시는 길·진료시간](${origin}/{{안내 페이지 경로}})`,
    },
    {
      title: "주소·전화번호를 모든 채널에서 똑같이",
      why: "AI 답변이 병원 위치를 서로 다르게 말하는 경우가 있습니다. 홈페이지·네이버 플레이스·구글 비즈니스·카카오맵·병원 정보 사이트의 상호·주소·전화가 한 글자도 다르지 않아야 합니다.",
      steps: [
        `홈페이지 하단(푸터)에 정식 상호·도로명 주소${ctx.place?.roadAddress ? `(${ctx.place.roadAddress})` : ""}·대표 전화를 텍스트로 적고, 다른 채널도 같은 값으로 맞춥니다.`,
      ],
    },
  ];
}

export type ExtraTask = { title: string; current: string; why: string; steps: string[]; code: string | null; verify: string };

/**
 * AI가 병원 위치를 틀리게 말할 때 홈페이지에서 할 일.
 * AI 답변에서 찾은 틀린 위치를 근거로 보여 주고, 실제 주소·좌표를 채운 코드를 준다.
 */
export function locationFixTask(ctx: FixContext, check: LocationCheck): ExtraTask | null {
  if (!check.wrong || !check.actual) return null;
  const { origin } = originOf(ctx.siteUrl);
  const actual = check.actual;
  const where = [actual.gu, actual.dong].filter(Boolean).join(" ");
  const examples = check.claims
    .filter((c) => c.verdict === "wrong")
    .slice(0, 3)
    .map((c) => `'${c.text}'`)
    .join(", ");
  return {
    title: "AI가 잘못 알고 있는 병원 위치 바로잡기",
    current: `최근 AI 답변 ${check.mentions}개 중 ${check.wrong}개가 병원 위치를 틀리게 말했습니다 (예: ${examples}). 실제 위치는 ${where} (${actual.roadAddress})입니다.`,
    why: "AI는 홈페이지·지도·병원 정보 사이트에서 주소를 모아 답합니다. 홈페이지에 주소가 이미지로만 있거나 구조화 데이터에 주소·좌표가 없으면 다른 지역 정보와 섞여 엉뚱한 동네로 소개되고, 환자는 다른 지역 병원으로 오해합니다.",
    steps: [
      `모든 페이지 공통 하단(푸터)에 주소를 글자로 넣습니다: "${actual.roadAddress}${actual.dong ? ` (${actual.dong})` : ""}". 지도 이미지나 캡처만으로 두지 않습니다.`,
      `'오시는 길' 페이지 첫 문단에 동네 이름과 가까운 역을 문장으로 적습니다. 예: "${ctx.hospitalName}은 ${shortRegion(ctx.region)} ${where}에 있습니다. {{가까운 역}}에서 도보 {{N}}분입니다."`,
      "아래 의료기관 구조화 데이터(JSON-LD)를 모든 페이지 <head>에 넣습니다. 주소와 좌표는 네이버 플레이스 기준으로 채워 두었습니다.",
      "네이버 플레이스·구글 비즈니스 프로필·카카오맵의 주소도 위와 한 글자도 다르지 않게 맞춥니다 (마케팅 담당 확인).",
    ],
    code: hospitalJsonLd({ ...ctx, origin }),
    verify:
      "validator.schema.org에서 address와 geo가 인식되는지 확인합니다. 이후 AI analytics 리포트의 'AI가 잘못 알고 있는 우리 병원 정보'에서 틀린 답변 수가 줄어드는지 봅니다 (AI에 반영되기까지 시간이 걸릴 수 있습니다).",
  };
}

/** HTML에 넣을 글자 */
function htmlText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 콘텐츠 처방의 페이지 설계서를 개발자가 바로 만들 수 있는 페이지 사양으로 */
export function newPageTask(ctx: FixContext, item: ContentPrescription): ExtraTask {
  const { origin } = originOf(ctx.siteUrl);
  const slug = item.page.slug.startsWith("/") ? item.page.slug : `/${item.page.slug}`;
  const url = `${origin}${slug}`;
  const description = item.page.summary.length > 110 ? `${item.page.summary.slice(0, 108)}…` : item.page.summary;
  const faqJson = item.page.faqs
    .map(
      (q) => `    {
      "@type": "Question",
      "name": "${q.replace(/"/g, '\\"')}",
      "acceptedAnswer": { "@type": "Answer", "text": "{{본문의 답변과 같은 내용 2~3문장}}" }
    }`
    )
    .join(",\n");
  const code = `<!-- ${url} -->
<head>
  <title>${htmlText(item.page.title)} | ${htmlText(ctx.hospitalName)}</title>
  <meta name="description" content="${htmlText(description)}">
  <link rel="canonical" href="${url}">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
${faqJson}
    ]
  }
  </script>
</head>
<body>
  <h1>${htmlText(item.page.title)}</h1>
  <p>${htmlText(item.page.summary)}</p>
${item.page.faqs.map((q) => `  <h2>${htmlText(q)}</h2>\n  <p>{{답변 2~3문장}}</p>`).join("\n")}
</body>`;
  const volume = item.volume === null ? "검색량 모름" : `월 ${item.volume.toLocaleString()}회 검색`;
  const rivals = item.competitors.map((c) => c.name).join(", ");
  return {
    title: item.page.title,
    current: `대상 질문 '${item.question}' · ${volume} · 지금 AI 추천 ${item.tally.count}/${item.tally.total}회${rivals ? ` · AI가 대신 추천: ${rivals}` : ""}`,
    why: item.gap,
    steps: [
      `주소 ${url} 로 새 페이지를 만들고, 메인 메뉴(또는 진료 안내 메뉴)와 관련 진료 페이지에서 이 페이지로 링크합니다.`,
      "아래 코드처럼 제목(title)·설명(description)·H1을 넣고, 첫 문단은 질문에 바로 답하는 문장으로 본문 맨 위에 글자로 둡니다.",
      "환자 질문을 H2 소제목으로 쓰고 바로 아래에 2~3문장으로 답합니다. 같은 내용을 FAQ 구조화 데이터에도 넣습니다.",
      `꼭 넣을 정보: ${item.page.mustHave.join(" / ")}`,
      "sitemap.xml에 이 주소를 추가하고, 네이버 서치어드바이저·구글 서치 콘솔에서 수집을 요청합니다.",
    ],
    code,
    verify: `페이지가 열리면 AI analytics에서 '${item.question}' 질문의 AI 추천 확률과 '우리 홈페이지 인용' 횟수가 오르는지 다음 리포트부터 확인합니다.`,
  };
}
