import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    "[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set. " +
      "Real-time features will be unavailable.",
  );
}

/**
 * Supabase browser client — uses the public anon key.
 *
 * Use cases:
 *  - Real-time subscriptions (notifications, leaderboard updates, etc.)
 *  - Any direct table queries that go through Row Level Security (RLS)
 *
 * All mutating operations (auth, writes) should still go through
 * the Express backend at /api/* which uses the service-role key.
 */
export const supabase = createClient(SUPABASE_URL ?? "", SUPABASE_ANON_KEY ?? "", {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

/**
 * Subscribe to real-time INSERT events on a Supabase table.
 *
 * @param table    Supabase table name (e.g. "notifications")
 * @param filter   Optional postgREST filter string (e.g. "user_id=eq.abc123")
 * @param onInsert Callback fired with the newly inserted row
 * @returns        Cleanup function — call it to unsubscribe (use as useEffect return)
 *
 * @example
 *   useEffect(() => {
 *     return subscribeToTable("notifications", `user_id=eq.${userId}`, (row) => {
 *       queryClient.invalidateQueries({ queryKey: ["notifications"] });
 *     });
 *   }, [userId]);
 */
export function subscribeToTable<T extends Record<string, unknown>>(
  table: string,
  filter: string | null,
  onInsert: (row: T) => void,
): () => void {
  const channelName = filter ? `rt:${table}:${filter}` : `rt:${table}`;

  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table,
        ...(filter ? { filter } : {}),
      },
      (payload) => onInsert(payload.new as T),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
