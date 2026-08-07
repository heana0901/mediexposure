import { NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/session";

const PUBLIC_PAGE_PATHS = ["/login"];
const PUBLIC_API_PREFIXES = ["/api/auth/login", "/api/cron/"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get("session")?.value;
  const session = await decrypt(token);

  const isApi = pathname.startsWith("/api");
  const isPublicPage = PUBLIC_PAGE_PATHS.includes(pathname);

  if (!session) {
    if (isApi) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    if (!isPublicPage) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  if (isPublicPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
