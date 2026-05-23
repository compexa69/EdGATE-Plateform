import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  mobile: string;
  role: string;
  status: string;
  photoB2Key: string | null;
  photoUrl: string | null;
  createdAt: string;
}

export function useGetProfile() {
  const { user } = useAuth();
  return useQuery<UserProfile>({
    queryKey: ["profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, email, mobile, role, status, photo_b2_key, created_at")
        .eq("id", user!.id)
        .single();
      if (error) throw error;

      let photoUrl: string | null = null;
      if (data.photo_b2_key) {
        const { data: urlData } = await supabase.functions.invoke("b2-presign", {
          body: { action: "download", key: data.photo_b2_key },
        });
        photoUrl = urlData?.url ?? null;
      }

      return {
        id: data.id,
        fullName: data.full_name,
        email: data.email,
        mobile: data.mobile,
        role: data.role,
        status: data.status,
        photoB2Key: data.photo_b2_key,
        photoUrl,
        createdAt: data.created_at,
      };
    },
  });
}

export function useUpdateProfile() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: { fullName?: string; mobile?: string }) => {
      const dbUpdates: Record<string, string> = {};
      if (updates.fullName) dbUpdates.full_name = updates.fullName;
      if (updates.mobile) dbUpdates.mobile = updates.mobile;

      const { error } = await supabase.from("users").update(dbUpdates).eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["profile"] }); },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async ({ currentPassword: _currentPassword, newPassword }: { currentPassword: string; newPassword: string }) => {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    },
  });
}

export function useGetProfileUploadUrl() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (fileName: string) => {
      const ext = fileName.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") ?? "jpg";
      const safeBase = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.[^.]+$/, "");
      const key = `profiles/${user!.id}/${Date.now()}-${safeBase}.${ext}`;
      const contentType = ["png", "jpg", "jpeg", "webp"].includes(ext.toLowerCase())
        ? `image/${ext.toLowerCase() === "jpg" ? "jpeg" : ext.toLowerCase()}`
        : "image/jpeg";

      const { data, error } = await supabase.functions.invoke("b2-presign", {
        body: { action: "upload", key, contentType },
      });
      if (error) throw error;
      return { uploadUrl: data.url as string, b2Key: key };
    },
  });
}

export function useUpdateProfilePhoto() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (b2Key: string) => {
      const { error } = await supabase.from("users").update({ photo_b2_key: b2Key }).eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["profile"] }); },
  });
}

export function useRemoveProfilePhoto() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("users").update({ photo_b2_key: null }).eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["profile"] }); },
  });
}

export function useRequestEmailChange() {
  return useMutation({
    mutationFn: async (newEmail: string) => {
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;
    },
  });
}

export function useDeleteAccount() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("users")
        .update({ status: "deleted" })
        .eq("id", user!.id);
      if (error) throw error;
      await supabase.auth.signOut();
    },
  });
}

export function useExportUserData() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (userId?: string) => {
      const targetId = userId ?? user!.id;
      const [
        { data: userData },
        { data: attempts },
        { data: results },
        { data: progress },
        { data: notes },
        { data: tasks },
      ] = await Promise.all([
        supabase.from("users").select("id, full_name, email, mobile, role, status, created_at").eq("id", targetId).single(),
        supabase.from("exam_attempts").select("*").eq("user_id", targetId),
        supabase.from("exam_results").select("*").eq("user_id", targetId),
        supabase.from("topic_progress").select("*").eq("user_id", targetId),
        supabase.from("notes").select("id, chapter_id, file_name, uploaded_at").eq("user_id", targetId),
        supabase.from("study_tasks").select("*").eq("user_id", targetId),
      ]);

      const exportData = { user: userData, attempts, results, topicProgress: progress, notes, tasks };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `user-data-${targetId}.json`;
      link.click();
      URL.revokeObjectURL(url);
    },
  });
}
