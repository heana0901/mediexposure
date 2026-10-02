import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 서버에서 리포트 PDF를 만드는 크롬. 번들에 넣지 않고 실행할 때 내려받는다
  serverExternalPackages: ["@sparticuz/chromium-min", "puppeteer-core"],
};

export default nextConfig;
