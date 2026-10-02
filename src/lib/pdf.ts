import "server-only";
import chromium from "@sparticuz/chromium-min";
import puppeteer, { type Browser } from "puppeteer-core";

/**
 * 리포트 HTML을 PDF로 만든다 (서버). 서버리스 환경용 크롬을 처음 쓸 때 내려받아 /tmp에 풀고,
 * 같은 서버가 다시 쓰일 때는 풀어 둔 것을 쓴다. 한글은 리포트 HTML이 불러오는 웹폰트로 그린다.
 */
const CHROMIUM_PACK_URL =
  process.env.CHROMIUM_PACK_URL ||
  "https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.x64.tar";

async function launch(): Promise<Browser> {
  // 로컬 개발: 설치된 크롬 경로 (예: C:/Program Files/Google/Chrome/Application/chrome.exe)
  const localChrome = process.env.CHROME_EXECUTABLE_PATH;
  if (localChrome) return puppeteer.launch({ executablePath: localChrome, headless: true });

  return puppeteer.launch({
    args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
    executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
    headless: "shell",
  });
}

export type PdfRenderer = (html: string) => Promise<Buffer>;

/** 크롬을 한 번 띄워 여러 리포트를 PDF로 만든다 (자동 실행에서 병원 여러 곳을 보낼 때) */
export async function withPdfRenderer<T>(fn: (render: PdfRenderer) => Promise<T>): Promise<T> {
  const browser = await launch();
  try {
    return await fn(async (html) => {
      const page = await browser.newPage();
      try {
        await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
        await page.evaluate(async () => {
          await document.fonts.ready;
        });
        const pdf = await page.pdf({
          format: "A4",
          printBackground: true,
          margin: { top: "12mm", bottom: "12mm", left: "10mm", right: "10mm" },
        });
        return Buffer.from(pdf);
      } finally {
        await page.close();
      }
    });
  } finally {
    await browser.close();
  }
}

export function htmlToPdf(html: string): Promise<Buffer> {
  return withPdfRenderer((render) => render(html));
}
