import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export async function requireAuth(
  req: Request,
): Promise<{ userId: string; role: string; status: string } | null> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error } = await anonClient.auth.getUser(token);
  if (error || !user) return null;

  const db = adminClient();
  const { data: profile } = await db
    .from("users")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();

  return { userId: user.id, role: profile?.role ?? "student", status: profile?.status ?? "pending_approval" };
}

export async function requireApproved(
  req: Request,
): Promise<{ userId: string; role: string } | null> {
  const user = await requireAuth(req);
  if (!user) return null;
  if (user.status !== "approved") return null;
  return { userId: user.userId, role: user.role };
}

export function requireServiceRole(req: Request): boolean {
  const key = req.headers.get("x-service-key") ?? "";
  return key === SUPABASE_SERVICE_ROLE_KEY;
}
