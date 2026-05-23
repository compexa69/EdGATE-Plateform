import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not set — Supabase features disabled");
}

export const supabase = createClient(
  SUPABASE_URL ?? "https://placeholder.supabase.co",
  SUPABASE_ANON_KEY ?? "placeholder",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: "edtech_supabase_session",
    },
  },
);

export function subscribeToTable<T extends Record<string, unknown>>(
  table: string,
  filter: string | null,
  onInsert: (row: T) => void,
): () => void {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return () => {};

  const channelName = filter ? `${table}:${filter}` : table;
  let ch = supabase
    .channel(channelName)
    .on(
      "postgres_changes" as any,
      {
        event: "INSERT",
        schema: "public",
        table,
        ...(filter ? { filter } : {}),
      },
      (payload: { new: T }) => {
        onInsert(payload.new);
      },
    );

  ch = ch.subscribe();
  return () => { supabase.removeChannel(ch); };
}
