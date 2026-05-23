import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";

export interface NoteItem {
  id: string;
  userId: string;
  chapterId: string;
  chapterName: string;
  subjectName: string;
  fileName: string;
  fileSizeBytes: number;
  b2Key: string;
  uploadedAt: string;
  annotations: string | null;
}

export function useListNotes() {
  const { user } = useAuth();
  return useQuery<NoteItem[]>({
    queryKey: ["notes", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: notes, error } = await supabase
        .from("notes")
        .select("id, user_id, chapter_id, file_name, file_size_bytes, b2_key, uploaded_at, annotations")
        .eq("user_id", user!.id)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;

      if (!notes || notes.length === 0) return [];

      const chapterIds = [...new Set(notes.map((n) => n.chapter_id))];
      const { data: chapters } = await supabase
        .from("chapters")
        .select("id, name, subject_id")
        .in("id", chapterIds);

      const subjectIds = [...new Set((chapters ?? []).map((c) => c.subject_id))];
      const { data: subjects } = await supabase
        .from("subjects")
        .select("id, name")
        .in("id", subjectIds);

      const chapterMap = new Map((chapters ?? []).map((c) => [c.id, c]));
      const subjectMap = new Map((subjects ?? []).map((s) => [s.id, s]));

      return notes.map((n) => {
        const ch = chapterMap.get(n.chapter_id);
        const sub = ch ? subjectMap.get(ch.subject_id) : null;
        return {
          id: n.id,
          userId: n.user_id,
          chapterId: n.chapter_id,
          chapterName: ch?.name ?? "Unknown Chapter",
          subjectName: sub?.name ?? "Unknown Subject",
          fileName: n.file_name,
          fileSizeBytes: n.file_size_bytes,
          b2Key: n.b2_key,
          uploadedAt: n.uploaded_at,
          annotations: n.annotations,
        };
      });
    },
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (noteId: string) => {
      const { error } = await supabase.from("notes").delete().eq("id", noteId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notes"] }); },
  });
}

export function useGetDownloadUrl() {
  return useMutation({
    mutationFn: async (b2Key: string) => {
      const { data, error } = await supabase.functions.invoke("b2-presign", {
        body: { action: "download", key: b2Key },
      });
      if (error) throw error;
      return data as { url: string };
    },
  });
}

export function useGetNoteAnnotations(noteId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["note-annotations", noteId, user?.id],
    enabled: !!noteId && !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("notes")
        .select("annotations")
        .eq("id", noteId)
        .eq("user_id", user!.id)
        .single();
      return { annotations: data?.annotations ?? null };
    },
  });
}

export function useSaveNoteAnnotations() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ noteId, annotations }: { noteId: string; annotations: string }) => {
      const { error } = await supabase
        .from("notes")
        .update({ annotations })
        .eq("id", noteId)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => { qc.invalidateQueries({ queryKey: ["note-annotations", vars.noteId] }); },
  });
}
