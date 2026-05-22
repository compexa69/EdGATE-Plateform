import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

// Node.js 20 lacks native WebSocket — import ws and shim global so
// the Supabase realtime client can initialize without crashing.
// We do not use realtime subscriptions; this is only to satisfy the
// constructor check inside @supabase/realtime-js.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ws = require("ws") as typeof WebSocket;
if (!("WebSocket" in globalThis)) {
  (globalThis as unknown as Record<string, unknown>).WebSocket = ws;
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export type SupabaseClient = typeof supabase;
