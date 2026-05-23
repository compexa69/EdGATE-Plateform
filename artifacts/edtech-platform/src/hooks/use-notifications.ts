import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export function useListNotifications() {
  const { user } = useAuth();
  return useQuery<NotificationItem[]>({
    queryKey: ["notifications", user?.id],
    enabled: !!user?.id,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, type, title, message, is_read, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        isRead: n.is_read,
        createdAt: n.created_at,
      }));
    },
  });
}

export function useMarkAllNotificationsRead() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user!.id)
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notifications"] }); },
  });
}

export function useMarkNotificationRead() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notificationId)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notifications"] }); },
  });
}

export function useBroadcastNotification() {
  return useMutation({
    mutationFn: async (data: { title: string; message: string; type?: string }) => {
      const { error: fnError } = await supabase.functions.invoke("broadcast-notification", {
        body: data,
      });
      if (fnError) {
        const { data: users, error } = await supabase.from("users").select("id").eq("status", "approved");
        if (error) throw error;
        const notifications = (users ?? []).map((u) => ({
          user_id: u.id,
          type: data.type ?? "announcement",
          title: data.title,
          message: data.message,
        }));
        if (notifications.length > 0) {
          const { error: insertError } = await supabase.from("notifications").insert(notifications);
          if (insertError) throw insertError;
        }
      }
    },
  });
}
