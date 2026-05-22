/**
 * Supabase browser client stub.
 *
 * Real-time subscriptions (notifications, leaderboard) are unavailable
 * without VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY. The app falls back
 * to polling every 5 minutes, so all core features still work.
 */

export const supabase = {
  channel: () => ({
    on: function () { return this; },
    subscribe: () => ({ unsubscribe: () => {} }),
  }),
  removeChannel: () => Promise.resolve(),
} as const;

export function subscribeToTable<T extends Record<string, unknown>>(
  _table: string,
  _filter: string | null,
  _onInsert: (row: T) => void,
): () => void {
  return () => {};
}
