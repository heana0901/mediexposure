import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";

export async function GET() {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  return NextResponse.json({ username: session.username, isAdmin: session.isAdmin });
}
