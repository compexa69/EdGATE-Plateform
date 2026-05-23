import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface AdminUser {
  id: string;
  fullName: string;
  email: string;
  mobile: string;
  role: string;
  status: string;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  photoB2Key: string | null;
}

export interface QrScanEntry {
  id: string;
  questionId: string;
  userId: string;
  userName: string | null;
  scannedAt: string;
  examId: string | null;
}

export function useListUsers() {
  return useQuery<AdminUser[]>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, email, mobile, role, status, email_verified, created_at, last_login_at, photo_b2_key")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((u) => ({
        id: u.id,
        fullName: u.full_name,
        email: u.email,
        mobile: u.mobile,
        role: u.role,
        status: u.status,
        emailVerified: u.email_verified,
        createdAt: u.created_at,
        lastLoginAt: u.last_login_at,
        photoB2Key: u.photo_b2_key,
      }));
    },
  });
}

async function invokeAdminAction(body: Record<string, unknown>): Promise<void> {
  const { data, error } = await supabase.functions.invoke("admin-actions", { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}

export function useApproveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      await invokeAdminAction({ action: "approve", userId });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); },
  });
}

export function useSuspendUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      await invokeAdminAction({ action: "suspend", userId });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); },
  });
}

export function useBanUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      await invokeAdminAction({ action: "ban", userId });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); },
  });
}

export function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      await invokeAdminAction({ action: "update-role", userId, role });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); },
  });
}

export function useResetUserProgress() {
  return useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      await invokeAdminAction({ action: "reset-progress", userId });
    },
  });
}

export function useListQuestions(filter?: { topicId?: string; difficulty?: string }) {
  return useListAdminQuestions(filter);
}

export function useListAdminQuestions(filter?: { topicId?: string; difficulty?: string }) {
  return useQuery({
    queryKey: ["admin-questions", filter],
    queryFn: async () => {
      let q = supabase
        .from("questions")
        .select("id, text, options, correct_option, marks, difficulty, topic_id, image_url, text_solution, video_url, qr_code_svg, created_at")
        .order("created_at", { ascending: false });
      if (filter?.topicId) q = q.eq("topic_id", filter.topicId);
      if (filter?.difficulty) q = q.eq("difficulty", filter.difficulty);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((q) => ({
        id: q.id,
        text: q.text,
        options: q.options as string[],
        correctOption: q.correct_option,
        marks: q.marks,
        difficulty: q.difficulty,
        topicId: q.topic_id,
        imageUrl: q.image_url,
        textSolution: q.text_solution,
        videoUrl: q.video_url,
        qrCodeSvg: q.qr_code_svg,
        createdAt: q.created_at,
      }));
    },
  });
}

export function useCreateQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      text: string; options: string[]; correctOption: string; marks?: number;
      difficulty?: string; topicId?: string; imageUrl?: string;
      textSolution?: string; videoUrl?: string; qrCodeSvg?: string;
    }) => {
      const { data: result, error } = await supabase.from("questions").insert({
        text: data.text,
        options: data.options,
        correct_option: data.correctOption,
        marks: data.marks ?? 4,
        difficulty: data.difficulty ?? "medium",
        topic_id: data.topicId ?? null,
        image_url: data.imageUrl ?? null,
        text_solution: data.textSolution ?? null,
        video_url: data.videoUrl ?? null,
        qr_code_svg: data.qrCodeSvg ?? null,
      }).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-questions"] }); },
  });
}

export function useUpdateQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: {
      id: string; text?: string; options?: string[]; correctOption?: string;
      marks?: number; difficulty?: string; topicId?: string;
      imageUrl?: string; textSolution?: string; videoUrl?: string; qrCodeSvg?: string;
    }) => {
      const updates: Record<string, any> = {};
      if (data.text !== undefined) updates.text = data.text;
      if (data.options !== undefined) updates.options = data.options;
      if (data.correctOption !== undefined) updates.correct_option = data.correctOption;
      if (data.marks !== undefined) updates.marks = data.marks;
      if (data.difficulty !== undefined) updates.difficulty = data.difficulty;
      if (data.topicId !== undefined) updates.topic_id = data.topicId;
      if (data.imageUrl !== undefined) updates.image_url = data.imageUrl;
      if (data.textSolution !== undefined) updates.text_solution = data.textSolution;
      if (data.videoUrl !== undefined) updates.video_url = data.videoUrl;
      if (data.qrCodeSvg !== undefined) updates.qr_code_svg = data.qrCodeSvg;

      const { error } = await supabase.from("questions").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-questions"] }); },
  });
}

export function useDeleteQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("questions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-questions"] }); },
  });
}

export function useGetSystemConfig() {
  return useQuery({
    queryKey: ["system-config"],
    queryFn: async () => {
      const { data } = await supabase.from("system_config").select("key, value");
      const config: Record<string, string> = {};
      for (const row of data ?? []) config[row.key] = row.value;
      return config;
    },
  });
}

export function useUpdateSystemConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: Record<string, string>) => {
      const rows = Object.entries(updates).map(([key, value]) => ({ key, value }));
      const { error } = await supabase.from("system_config").upsert(rows, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["system-config"] }); },
  });
}
