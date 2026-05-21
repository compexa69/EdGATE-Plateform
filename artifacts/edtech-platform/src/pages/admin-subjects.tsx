import {
  useListSubjects, useCreateSubject, useUpdateSubject, useDeleteSubject,
  useListChapters, useCreateChapter, useUpdateChapter, useDeleteChapter,
  useListTopics, useCreateTopic, useUpdateTopic, useDeleteTopic,
} from "@workspace/api-client-react";
import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Edit, Trash, BookOpen, Layers, List, ChevronRight,
  Link2, Upload, FileSpreadsheet, CheckCircle,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

type View = "subjects" | "chapters" | "topics";

interface SubjectForm { name: string; description: string; order: number; }
interface ChapterForm { name: string; description: string; order: number; }
interface TopicForm { name: string; description: string; order: number; telegramChatId: string; telegramMessageId: string; }

const emptySubjectForm: SubjectForm = { name: "", description: "", order: 0 };
const emptyChapterForm: ChapterForm = { name: "", description: "", order: 0 };
const emptyTopicForm: TopicForm = { name: "", description: "", order: 0, telegramChatId: "", telegramMessageId: "" };

function parseSyllabusCsv(text: string): Array<{ subject_name: string; chapter_name: string; topic_name: string; topic_order?: number }> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idxSubject = headers.indexOf("subject_name");
  const idxChapter = headers.indexOf("chapter_name");
  const idxTopic = headers.indexOf("topic_name");
  const idxOrder = headers.indexOf("topic_order");
  if (idxSubject === -1 || idxChapter === -1 || idxTopic === -1) return [];
  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
    return {
      subject_name: cols[idxSubject] ?? "",
      chapter_name: cols[idxChapter] ?? "",
      topic_name: cols[idxTopic] ?? "",
      topic_order: idxOrder !== -1 && cols[idxOrder] ? Number(cols[idxOrder]) : undefined,
    };
  }).filter((r) => r.subject_name && r.chapter_name && r.topic_name);
}

function SyllabusImportDialog() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ReturnType<typeof parseSyllabusCsv>>([]);
  const [result, setResult] = useState<{ subjects: number; chapters: number; topics: number } | null>(null);
  const [isPending, setIsPending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseSyllabusCsv(ev.target?.result as string ?? "");
      setRows(parsed);
      setResult(null);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!rows.length) return;
    setIsPending(true);
    try {
      const token = localStorage.getItem("edtech_token") ?? "";
      const res = await fetch("/api/admin/import-syllabus", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.error || "Import failed", variant: "destructive" }); return; }
      setResult(data.created);
      toast({ title: "Syllabus imported!", description: `${data.created.subjects} subjects, ${data.created.chapters} chapters, ${data.created.topics} topics created.` });
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setIsPending(false);
    }
  };

  const handleClose = (v: boolean) => {
    setOpen(v);
    if (!v) { setRows([]); setResult(null); if (fileRef.current) fileRef.current.value = ""; }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <FileSpreadsheet className="w-3.5 h-3.5" /> Import CSV
      </Button>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-primary" /> Import Syllabus from CSV
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="p-3 rounded-lg bg-muted/30 border border-border text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Required CSV columns:</p>
              <code className="block font-mono">subject_name, chapter_name, topic_name, topic_order</code>
              <p><code className="font-mono">topic_order</code> is optional. Existing subjects/chapters/topics are skipped (no duplicates).</p>
            </div>

            <div className="space-y-1.5">
              <Label>CSV File</Label>
              <div className="flex gap-2">
                <Input type="file" accept=".csv,text/csv" ref={fileRef} onChange={handleFile} className="flex-1" />
              </div>
            </div>

            {rows.length > 0 && !result && (
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-sm">
                <p className="font-medium text-primary">{rows.length} rows parsed</p>
                <p className="text-xs text-muted-foreground mt-0.5">Preview (first 3):</p>
                <ul className="mt-1 space-y-0.5 text-xs font-mono">
                  {rows.slice(0, 3).map((r, i) => (
                    <li key={i} className="truncate text-muted-foreground">{r.subject_name} → {r.chapter_name} → {r.topic_name}</li>
                  ))}
                  {rows.length > 3 && <li className="text-muted-foreground">…and {rows.length - 3} more</li>}
                </ul>
              </div>
            )}

            {result && (
              <div className="p-3 rounded-lg bg-success/10 border border-success/20 text-sm flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-success shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-success">Import complete</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Created: {result.subjects} subject{result.subjects !== 1 ? "s" : ""}, {result.chapters} chapter{result.chapters !== 1 ? "s" : ""}, {result.topics} topic{result.topics !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => handleClose(false)}>
                {result ? "Close" : "Cancel"}
              </Button>
              {!result && (
                <Button className="flex-1 gap-1.5" onClick={handleImport} disabled={rows.length === 0 || isPending}>
                  <Upload className="w-4 h-4" />
                  {isPending ? "Importing…" : `Import ${rows.length} Rows`}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TopicsPanel({ chapterId, chapterName }: { chapterId: string; chapterName: string }) {
  const { data: topics, isLoading, refetch } = useListTopics(chapterId, { query: { enabled: !!chapterId, queryKey: ["topics", chapterId] } as any });
  const createTopic = useCreateTopic();
  const updateTopic = useUpdateTopic();
  const deleteTopic = useDeleteTopic();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editTopic, setEditTopic] = useState<{ id: string } & TopicForm | null>(null);
  const [form, setForm] = useState<TopicForm>(emptyTopicForm);

  if (isLoading) return <div className="p-4 text-muted-foreground text-sm">Loading topics...</div>;

  const handleCreate = () => {
    createTopic.mutate({
      chapterId,
      data: {
        name: form.name,
        description: form.description || undefined,
        order: form.order,
        telegramChatId: form.telegramChatId || undefined,
        telegramMessageId: form.telegramMessageId || undefined,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Topic created" });
        setIsCreateOpen(false);
        setForm(emptyTopicForm);
        refetch();
      },
      onError: () => toast({ title: "Failed to create topic", variant: "destructive" }),
    });
  };

  const handleUpdate = () => {
    if (!editTopic) return;
    updateTopic.mutate({
      topicId: editTopic.id,
      data: {
        name: editTopic.name,
        description: editTopic.description || undefined,
        order: editTopic.order,
        telegramChatId: editTopic.telegramChatId || undefined,
        telegramMessageId: editTopic.telegramMessageId || undefined,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Topic updated" });
        setEditTopic(null);
        refetch();
      },
      onError: () => toast({ title: "Failed to update topic", variant: "destructive" }),
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this topic? This cannot be undone.")) return;
    deleteTopic.mutate({ topicId: id }, {
      onSuccess: () => { toast({ title: "Topic deleted" }); refetch(); },
      onError: () => toast({ title: "Failed to delete topic", variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{topics?.length ?? 0} topics in <span className="font-medium text-foreground">{chapterName}</span></span>
        <Button size="sm" onClick={() => { setForm(emptyTopicForm); setIsCreateOpen(true); }}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Topic
        </Button>
      </div>

      {topics?.length === 0 && (
        <div className="text-center py-6 text-muted-foreground text-sm bg-muted/20 rounded-lg border border-dashed border-border">
          No topics yet. Add one to get started.
        </div>
      )}

      {topics?.map((topic, idx) => (
        <div key={topic.id} className="flex items-start gap-3 p-3 bg-muted/20 rounded-lg border border-border/50 group">
          <div className="shrink-0 w-6 h-6 rounded bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground mt-0.5">
            {idx + 1}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">{topic.name}</div>
            {topic.description && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{topic.description}</div>}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {topic.telegramChatId && (
                <Badge variant="outline" className="text-xs gap-1 h-5">
                  <Link2 className="w-2.5 h-2.5" /> Telegram
                </Badge>
              )}
              {(topic as any).telegramUrl && (
                <Badge variant="outline" className="text-xs gap-1 h-5">
                  <Link2 className="w-2.5 h-2.5" /> TG URL
                </Badge>
              )}
              {(topic as any).youtubeUrl && (
                <Badge variant="outline" className="text-xs gap-1 h-5 border-red-500/30 text-red-400">
                  ▶ YouTube
                </Badge>
              )}
              <Badge variant="outline" className="text-xs h-5">Order: {topic.order}</Badge>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditTopic({
              id: topic.id, name: topic.name, description: topic.description ?? "",
              order: topic.order, telegramChatId: topic.telegramChatId ?? "",
              telegramMessageId: topic.telegramMessageId ?? "",
            })}>
              <Edit className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(topic.id)}>
              <Trash className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      ))}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Topic to "{chapterName}"</DialogTitle></DialogHeader>
          <TopicFormFields form={form} setForm={(f) => setForm(prev => ({ ...prev, ...f }))} />
          <Button onClick={handleCreate} disabled={!form.name || createTopic.isPending} className="w-full mt-2">
            {createTopic.isPending ? "Creating..." : "Create Topic"}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTopic} onOpenChange={(o) => !o && setEditTopic(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Topic</DialogTitle></DialogHeader>
          {editTopic && <TopicFormFields form={editTopic} setForm={(f) => setEditTopic({ ...editTopic, ...f })} />}
          <Button onClick={handleUpdate} disabled={!editTopic?.name || updateTopic.isPending} className="w-full mt-2">
            {updateTopic.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TopicFormFields({ form, setForm }: { form: TopicForm; setForm: (f: Partial<TopicForm>) => void }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Name *</Label>
        <Input value={form.name} onChange={e => setForm({ name: e.target.value })} placeholder="Topic name" />
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea value={form.description} onChange={e => setForm({ description: e.target.value })} placeholder="Optional description" rows={2} />
      </div>
      <div className="space-y-1.5">
        <Label>Order</Label>
        <Input type="number" value={form.order} onChange={e => setForm({ order: Number(e.target.value) })} />
      </div>
      <div className="border border-border/50 rounded-lg p-3 space-y-2 bg-muted/20">
        <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
          <Link2 className="w-3.5 h-3.5" /> Telegram Lecture Link (optional)
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Chat ID</Label>
          <Input value={form.telegramChatId} onChange={e => setForm({ telegramChatId: e.target.value })} placeholder="-100xxxxxxxxx or @channelname" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Message ID</Label>
          <Input value={form.telegramMessageId} onChange={e => setForm({ telegramMessageId: e.target.value })} placeholder="Message ID of the lecture video" />
        </div>
      </div>
    </div>
  );
}

function ChaptersPanel({ subjectId, subjectName, onDrillIntoTopics }: {
  subjectId: string;
  subjectName: string;
  onDrillIntoTopics: (chapterId: string, chapterName: string) => void;
}) {
  const { data: chapters, isLoading, refetch } = useListChapters(subjectId, { query: { enabled: !!subjectId, queryKey: ["chapters", subjectId] } as any });
  const createChapter = useCreateChapter();
  const updateChapter = useUpdateChapter();
  const deleteChapter = useDeleteChapter();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editChapter, setEditChapter] = useState<{ id: string } & ChapterForm | null>(null);
  const [form, setForm] = useState<ChapterForm>(emptyChapterForm);

  if (isLoading) return <div className="p-4 text-muted-foreground text-sm">Loading chapters...</div>;

  const handleCreate = () => {
    createChapter.mutate({
      subjectId,
      data: { name: form.name, description: form.description || undefined, order: form.order }
    }, {
      onSuccess: () => {
        toast({ title: "Chapter created" });
        setIsCreateOpen(false);
        setForm(emptyChapterForm);
        refetch();
      },
      onError: () => toast({ title: "Failed to create chapter", variant: "destructive" }),
    });
  };

  const handleUpdate = () => {
    if (!editChapter) return;
    updateChapter.mutate({
      chapterId: editChapter.id,
      data: { name: editChapter.name, description: editChapter.description || undefined, order: editChapter.order }
    }, {
      onSuccess: () => { toast({ title: "Chapter updated" }); setEditChapter(null); refetch(); },
      onError: () => toast({ title: "Failed to update chapter", variant: "destructive" }),
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this chapter and all its topics? This cannot be undone.")) return;
    deleteChapter.mutate({ chapterId: id }, {
      onSuccess: () => { toast({ title: "Chapter deleted" }); refetch(); },
      onError: () => toast({ title: "Failed to delete chapter", variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{chapters?.length ?? 0} chapters in <span className="font-medium text-foreground">{subjectName}</span></span>
        <Button size="sm" onClick={() => { setForm(emptyChapterForm); setIsCreateOpen(true); }}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Chapter
        </Button>
      </div>

      {chapters?.length === 0 && (
        <div className="text-center py-6 text-muted-foreground text-sm bg-muted/20 rounded-lg border border-dashed border-border">
          No chapters yet. Add one to get started.
        </div>
      )}

      <div className="space-y-2">
        {chapters?.map((chapter, idx) => (
          <div key={chapter.id} className="flex items-center gap-3 p-3 bg-card rounded-lg border border-card-border group hover:border-primary/30 transition-colors">
            <div className="shrink-0 w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
              {idx + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium">{chapter.name}</div>
              {chapter.description && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{chapter.description}</div>}
              <div className="text-xs text-muted-foreground mt-1">{chapter.totalTopics} topics · Order: {chapter.order}</div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onDrillIntoTopics(chapter.id, chapter.name)}>
                <List className="w-3.5 h-3.5 mr-1" /> Topics
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditChapter({
                id: chapter.id, name: chapter.name, description: chapter.description ?? "", order: chapter.order,
              })}>
                <Edit className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(chapter.id)}>
                <Trash className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Chapter to "{subjectName}"</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Chapter name" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional description" rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Order</Label>
              <Input type="number" value={form.order} onChange={e => setForm({ ...form, order: Number(e.target.value) })} />
            </div>
            <Button onClick={handleCreate} disabled={!form.name || createChapter.isPending} className="w-full">
              {createChapter.isPending ? "Creating..." : "Create Chapter"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editChapter} onOpenChange={(o) => !o && setEditChapter(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Chapter</DialogTitle></DialogHeader>
          {editChapter && (
            <div className="space-y-3 pt-2">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input value={editChapter.name} onChange={e => setEditChapter({ ...editChapter, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea value={editChapter.description} onChange={e => setEditChapter({ ...editChapter, description: e.target.value })} rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label>Order</Label>
                <Input type="number" value={editChapter.order} onChange={e => setEditChapter({ ...editChapter, order: Number(e.target.value) })} />
              </div>
              <Button onClick={handleUpdate} disabled={!editChapter.name || updateChapter.isPending} className="w-full">
                {updateChapter.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminSubjects() {
  const { data: subjects, isLoading, refetch } = useListSubjects();
  const createSubject = useCreateSubject();
  const updateSubject = useUpdateSubject();
  const deleteSubject = useDeleteSubject();
  const { toast } = useToast();

  const [view, setView] = useState<View>("subjects");
  const [selectedSubject, setSelectedSubject] = useState<{ id: string; name: string } | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<{ id: string; name: string } | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editSubject, setEditSubject] = useState<{ id: string } & SubjectForm | null>(null);
  const [form, setForm] = useState<SubjectForm>(emptySubjectForm);

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  const handleCreate = () => {
    createSubject.mutate({ data: { name: form.name, description: form.description, order: form.order } }, {
      onSuccess: () => {
        toast({ title: "Subject created" });
        setIsCreateOpen(false);
        setForm(emptySubjectForm);
        refetch();
      },
      onError: () => toast({ title: "Failed to create subject", variant: "destructive" }),
    });
  };

  const handleUpdate = () => {
    if (!editSubject) return;
    updateSubject.mutate({ subjectId: editSubject.id, data: { name: editSubject.name, description: editSubject.description, order: editSubject.order } }, {
      onSuccess: () => { toast({ title: "Subject updated" }); setEditSubject(null); refetch(); },
      onError: () => toast({ title: "Failed to update subject", variant: "destructive" }),
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this subject and all its chapters/topics? This cannot be undone.")) return;
    deleteSubject.mutate({ subjectId: id }, {
      onSuccess: () => { toast({ title: "Subject deleted" }); refetch(); },
      onError: () => toast({ title: "Failed to delete subject", variant: "destructive" }),
    });
  };

  const drillToChapters = (id: string, name: string) => {
    setSelectedSubject({ id, name });
    setSelectedChapter(null);
    setView("chapters");
  };

  const drillToTopics = (id: string, name: string) => {
    setSelectedChapter({ id, name });
    setView("topics");
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6 pb-24 md:pb-8">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Content Hierarchy</h1>
          <p className="text-muted-foreground mt-1">Manage subjects, chapters, and topics.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SyllabusImportDialog />
          {view === "subjects" && (
            <Button onClick={() => { setForm(emptySubjectForm); setIsCreateOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" /> Add Subject
            </Button>
          )}
        </div>
      </div>

      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-sm flex-wrap">
        <button
          onClick={() => setView("subjects")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
            view === "subjects" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80 text-muted-foreground"
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" /> Subjects ({subjects?.length ?? 0})
        </button>
        {selectedSubject && (
          <>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            <button
              onClick={() => setView("chapters")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                view === "chapters" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80 text-muted-foreground"
              }`}
            >
              <Layers className="w-3.5 h-3.5" /> {selectedSubject.name}
            </button>
          </>
        )}
        {selectedChapter && (
          <>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            <button
              onClick={() => setView("topics")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                view === "topics" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80 text-muted-foreground"
              }`}
            >
              <List className="w-3.5 h-3.5" /> {selectedChapter.name}
            </button>
          </>
        )}
      </div>

      {/* Panel: Subjects */}
      {view === "subjects" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {subjects?.map((subject) => (
            <Card key={subject.id} className="border-card-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-primary" />
                  {subject.name}
                </CardTitle>
                {subject.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{subject.description}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Layers className="w-3.5 h-3.5" />
                  <span>{subject.totalChapters} chapters</span>
                  <span className="ml-auto">Order: {subject.order}</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 text-xs h-8" onClick={() => drillToChapters(subject.id, subject.name)}>
                    <Layers className="w-3.5 h-3.5 mr-1" /> Chapters
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditSubject({
                    id: subject.id, name: subject.name, description: subject.description ?? "", order: subject.order,
                  })}>
                    <Edit className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(subject.id)}>
                    <Trash className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {subjects?.length === 0 && (
            <div className="col-span-full p-8 text-center text-muted-foreground bg-muted/20 rounded-lg border border-dashed border-border">
              No subjects found. Create one to get started.
            </div>
          )}
        </div>
      )}

      {/* Panel: Chapters */}
      {view === "chapters" && selectedSubject && (
        <Card className="border-card-border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Layers className="w-4 h-4 text-primary" /> Chapters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChaptersPanel subjectId={selectedSubject.id} subjectName={selectedSubject.name} onDrillIntoTopics={drillToTopics} />
          </CardContent>
        </Card>
      )}

      {/* Panel: Topics */}
      {view === "topics" && selectedChapter && (
        <Card className="border-card-border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <List className="w-4 h-4 text-primary" /> Topics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TopicsPanel chapterId={selectedChapter.id} chapterName={selectedChapter.name} />
          </CardContent>
        </Card>
      )}

      {/* Create Subject Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create New Subject</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Physics" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Brief description" rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Order</Label>
              <Input type="number" value={form.order} onChange={e => setForm({ ...form, order: Number(e.target.value) })} />
            </div>
            <Button onClick={handleCreate} disabled={!form.name || createSubject.isPending} className="w-full">
              {createSubject.isPending ? "Creating..." : "Create Subject"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Subject Dialog */}
      <Dialog open={!!editSubject} onOpenChange={(o) => !o && setEditSubject(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Subject</DialogTitle></DialogHeader>
          {editSubject && (
            <div className="space-y-3 pt-2">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input value={editSubject.name} onChange={e => setEditSubject({ ...editSubject, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea value={editSubject.description} onChange={e => setEditSubject({ ...editSubject, description: e.target.value })} rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label>Order</Label>
                <Input type="number" value={editSubject.order} onChange={e => setEditSubject({ ...editSubject, order: Number(e.target.value) })} />
              </div>
              <Button onClick={handleUpdate} disabled={!editSubject.name || updateSubject.isPending} className="w-full">
                {updateSubject.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
