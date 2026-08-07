import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { decrypt, type SessionPayload } from "./session";
import { getSupabaseServerClient } from "./supabase";

export const verifySession = cache(async (): Promise<SessionPayload | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  return decrypt(token);
});

type AccessResult =
  | { ok: true; session: SessionPayload }
  | { ok: false; status: 401 | 403 };

export async function assertClientAccess(clientId: string): Promise<AccessResult> {
  const session = await verifySession();
  if (!session) return { ok: false, status: 401 };
  if (session.isAdmin) return { ok: true, session };

  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("user_clients")
    .select("client_id")
    .eq("user_id", session.userId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (!data) return { ok: false, status: 403 };
  return { ok: true, session };
}

export async function getAllowedClientIds(session: SessionPayload): Promise<string[] | null> {
  if (session.isAdmin) return null; // null = 전체 허용
  const supabase = getSupabaseServerClient();
  const { data } = await supabase.from("user_clients").select("client_id").eq("user_id", session.userId);
  return (data ?? []).map((r) => r.client_id);
}
