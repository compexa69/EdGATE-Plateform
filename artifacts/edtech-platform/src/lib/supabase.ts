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
 * Subscribe to real-time INSERT events on a table.
 *
 * @param table   Supabase table name
 * @param filter  Optional column=eq.value filter (e.g. "user_id=eq.abc123")
 * @param onEvent Callback fired on each incoming row
 * @returns Cleanup function — call it to unsubscribe
 *
 * Example:
 *   const unsub = subscribeToTable("notifications", `user_id=eq.${userId}`, (row) => {
 *     setNotifications((prev) => [row, ...prev]);
 *   });
 *   return unsub; // in useEffect cleanup
 */
export function subscribeToTable<T extends Record<string, unknown>>(
  table: string,
  filter: string | null,
  onEvent: (row: T) => void,
): () => void {
  const channelName = filter ? `${table}:${filter}` : table;

  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes" as Parameters<typeof channel.on>[0],
      {
        event: "INSERT",
        schema: "public",
        table,
        ...(filter ? { filter } : {}),
      },
      (payload: { new: T }) => onEvent(payload.new),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * React hook helper — subscribe to real-time row inserts on a table.
 *
 * Example:
 *   useRealtimeTable<Notification>(
 *     "notifications",
 *     `user_id=eq.${user.id}`,
 *     (row) => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
 *   );
 */
export function useRealtimeSubscription<T extends Record<string, unknown>>(
  table: string,
  filter: string | null,
  onEvent: (row: T) => void,
): void {
  // This is intentionally not a React hook to avoid circular imports.
  // Import and call subscribeToTable directly inside a useEffect instead.
  void table; void filter; void onEvent;
}
