import {
  useListSubjects, useCreateSubject, useUpdateSubject, useDeleteSubject,
  useListChapters, useCreateChapter, useUpdateChapter, useDeleteChapter,
  useListTopics, useCreateTopic, useUpdateTopic, useDeleteTopic,
} from "@/hooks/use-subjects";
import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Edit, Trash, BookOpen, Layers, List, ChevronRight,
  Link2, Upload, FileSpreadsheet, CheckCircle, Download,
  ChevronDown, ChevronUp, AlertCircle, FileJson,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";

type View = "subjects" | "chapters" | "topics";

interface SubjectForm { name: string; description: string; order: number; }
interface ChapterForm { name: string; description: string; order: number; }
interface TopicForm { name: string; description: string; order: number; telegramChatId: string; telegramMessageId: string; telegramUrl: string; youtubeUrl: string; }

const emptySubjectForm: SubjectForm = { name: "", description: "", order: 0 };
const emptyChapterForm: ChapterForm = { name: "", description: "", order: 0 };
const emptyTopicForm: TopicForm = { name: "", description: "", order: 0, telegramChatId: "", telegramMessageId: "", telegramUrl: "", youtubeUrl: "" };

// ── Types ────────────────────────────────────────────────────────────────────
interface FlatRow {
  subject_name: string;
  chapter_name: string;
  topic_name: string;
  subject_order?: number;
  chapter_order?: number;
  topic_order?: number;
  subject_description?: string;
  chapter_description?: string;
  topic_description?: string;
  telegram_url?: string;
  telegram_chat_id?: string;
  telegram_message_id?: string;
  youtube_url?: string;
}

interface ImportResult {
  created: { subjects: number; chapters: number; topics: number };
  skipped: { subjects: number; chapters: number; topics: number };
  totalRows: number;
}

interface TreeNode {
  subject: string;
  chapters: { name: string; topics: string[] }[];
}

// ── Parsers ──────────────────────────────────────────────────────────────────
function parseCsv(text: string): FlatRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const idx = (name: string) => headers.indexOf(name);

  if (idx("subject_name") === -1 || idx("chapter_name") === -1 || idx("topic_name") === -1) return [];

  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
    const get = (name: string) => cols[idx(name)] ?? "";
    const getNum = (name: string) => { const v = get(name); return v ? Number(v) : undefined; };
    return {
      subject_name: get("subject_name"),
      chapter_name: get("chapter_name"),
      topic_name: get("topic_name"),
      subject_order: getNum("subject_order"),
      chapter_order: getNum("chapter_order"),
      topic_order: getNum("topic_order"),
      subject_description: get("subject_description") || undefined,
      chapter_description: get("chapter_description") || undefined,
      topic_description: get("topic_description") || undefined,
      telegram_url: get("telegram_url") || undefined,
      telegram_chat_id: get("telegram_chat_id") || undefined,
      telegram_message_id: get("telegram_message_id") || undefined,
      youtube_url: get("youtube_url") || undefined,
    };
  }).filter((r) => r.subject_name && r.chapter_name && r.topic_name);
}

function parseJson(text: string): FlatRow[] | null {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return null; }

  // Flat array: [{ subject_name, chapter_name, topic_name, ... }]
  if (Array.isArray(parsed) && parsed.length > 0 && "subject_name" in (parsed[0] as object)) {
    return (parsed as FlatRow[]).filter((r) => r.subject_name && r.chapter_name && r.topic_name);
  }

  // Nested array: [{ name, chapters: [{ name, topics: [{ name }] }] }]
  if (Array.isArray(parsed)) {
    const rows: FlatRow[] = [];
    for (const subj of parsed as Array<{ name: string; order?: number; description?: string; chapters?: Array<{ name: string; order?: number; description?: string; topics?: Array<{ name: string; order?: number; description?: string; telegram_url?: string; youtube_url?: string }> }> }>) {
      for (const ch of subj.chapters ?? []) {
        for (const tp of ch.topics ?? []) {
          rows.push({
            subject_name: subj.name,
            subject_order: subj.order,
            subject_description: subj.description,
            chapter_name: ch.name,
            chapter_order: ch.order,
            chapter_description: ch.description,
            topic_name: tp.name,
            topic_order: tp.order,
            topic_description: tp.description,
            telegram_url: tp.telegram_url,
            youtube_url: tp.youtube_url,
          });
        }
      }
    }
    return rows.filter((r) => r.subject_name && r.chapter_name && r.topic_name);
  }

  return null;
}

function buildTree(rows: FlatRow[]): TreeNode[] {
  const map = new Map<string, Map<string, Set<string>>>();
  for (const r of rows) {
    if (!map.has(r.subject_name)) map.set(r.subject_name, new Map());
    const chMap = map.get(r.subject_name)!;
    if (!chMap.has(r.chapter_name)) chMap.set(r.chapter_name, new Set());
    chMap.get(r.chapter_name)!.add(r.topic_name);
  }
  return [...map.entries()].map(([subject, chMap]) => ({
    subject,
    chapters: [...chMap.entries()].map(([name, topics]) => ({ name, topics: [...topics] })),
  }));
}

// ── Template downloads ───────────────────────────────────────────────────────
const CSV_TEMPLATE =
  "subject_name,chapter_name,topic_name,topic_order,subject_order,chapter_order,telegram_url,youtube_url\n" +
  "Physics,Mechanics,Newton's First Law,1,1,1,,\n" +
  "Physics,Mechanics,Newton's Second Law,2,1,1,,\n" +
  "Physics,Thermodynamics,Zeroth Law of Thermodynamics,1,1,2,,\n" +
  "Chemistry,Physical Chemistry,Mole Concept,1,2,1,,https://youtube.com/watch?v=example\n";

const JSON_TEMPLATE = JSON.stringify([
  {
    name: "Physics",
    order: 1,
    chapters: [
      {
        name: "Mechanics",
        order: 1,
        topics: [
          { name: "Newton's First Law", order: 1 },
          { name: "Newton's Second Law", order: 2 },
        ],
      },
      {
        name: "Thermodynamics",
        order: 2,
        topics: [{ name: "Zeroth Law of Thermodynamics", order: 1 }],
      },
    ],
  },
  {
    name: "Chemistry",
    order: 2,
    chapters: [
      {
        name: "Physical Chemistry",
        order: 1,
        topics: [{ name: "Mole Concept", order: 1, youtube_url: "https://youtube.com/watch?v=example" }],
      },
    ],
  },
], null, 2);

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Tree preview component ───────────────────────────────────────────────────
function TreePreview({ tree }: { tree: TreeNode[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(tree.slice(0, 2).map((n) => n.subject)));

  const toggle = (subject: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(subject) ? next.delete(subject) : next.add(subject);
      return next;
    });
  };

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 overflow-hidden">
      <div className="px-3 py-2 bg-primary/10 border-b border-primary/20 flex items-center justify-between">
        <span className="text-xs font-semibold text-primary">
          {tree.length} subject{tree.length !== 1 ? "s" : ""} · {tree.reduce((s, n) => s + n.chapters.length, 0)} chapters · {tree.reduce((s, n) => s + n.chapters.reduce((cs, c) => cs + c.topics.length, 0), 0)} topics
        </span>
        <button
          className="text-xs text-primary/70 hover:text-primary"
          onClick={() => setExpanded(expanded.size === tree.length ? new Set() : new Set(tree.map((n) => n.subject)))}
        >
          {expanded.size === tree.length ? "Collapse all" : "Expand all"}
        </button>
      </div>
      <div className="max-h-52 overflow-y-auto divide-y divide-border/30">
        {tree.map((node) => {
          const isOpen = expanded.has(node.subject);
          const topicCount = node.chapters.reduce((s, c) => s + c.topics.length, 0);
          return (
            <div key={node.subject}>
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/30 transition-colors text-left"
                onClick={() => toggle(node.subject)}
              >
                {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-primary shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                <BookOpen className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="font-medium flex-1 truncate">{node.subject}</span>
                <span className="text-xs text-muted-foreground shrink-0">{node.chapters.length} ch · {topicCount} tp</span>
              </button>
              {isOpen && (
                <div className="pl-8 pb-1">
                  {node.chapters.map((ch) => (
                    <div key={ch.name} className="py-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-0.5">
                        <Layers className="w-3 h-3 shrink-0" />
                        <span className="font-medium text-foreground/80 truncate">{ch.name}</span>
                        <span className="ml-auto shrink-0">{ch.topics.length} topics</span>
                      </div>
                      <div className="pl-4 space-y-0.5">
                        {ch.topics.slice(0, 3).map((tp) => (
                          <div key={tp} className="text-xs text-muted-foreground truncate flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-muted-foreground/40 shrink-0" />
                            {tp}
                          </div>
                        ))}
                        {ch.topics.length > 3 && (
                          <div className="text-xs text-muted-foreground/60 pl-2">+{ch.topics.length - 3} more</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────
function SyllabusImportDialog() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<FlatRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const tree = buildTree(rows);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    setRows([]);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string ?? "";
      const ext = file.name.split(".").pop()?.toLowerCase();

      let parsed: FlatRow[] | null = null;
      if (ext === "json") {
        parsed = parseJson(text);
        if (parsed === null) {
          setParseError("Invalid JSON. Expected an array of flat rows or a nested subject/chapter/topic tree.");
          return;
        }
      } else {
        parsed = parseCsv(text);
        if (parsed.length === 0) {
          setParseError("Could not parse CSV. Check that it has subject_name, chapter_name, and topic_name columns in the header row.");
          return;
        }
      }

      if (parsed.length === 0) {
        setParseError("File parsed but no valid rows found.");
        return;
      }
      setRows(parsed);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!rows.length) return;
    setIsPending(true);
    try {
      const { data, error } = await supabase.functions.invoke("import-syllabus", {
        body: { rows },
      });
      if (error) { toast({ title: error.message || "Import failed", variant: "destructive" }); return; }
      if (data?.error) { toast({ title: data.error, variant: "destructive" }); return; }
      setResult(data as ImportResult);
      qc.invalidateQueries({ queryKey: ["subjects"] });
      toast({
        title: "Syllabus imported!",
        description: `Created: ${data.created.subjects} subjects, ${data.created.chapters} chapters, ${data.created.topics} topics.`,
      });
    } catch (e) {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setIsPending(false);
    }
  };

  const handleClose = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setRows([]);
      setResult(null);
      setParseError(null);
      setShowTemplates(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <FileSpreadsheet className="w-3.5 h-3.5" /> Import Syllabus
      </Button>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-primary" /> Import Syllabus
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {/* Format info + templates */}
            <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-3 py-2.5 text-xs hover:bg-muted/40 transition-colors"
                onClick={() => setShowTemplates((v) => !v)}
              >
                <span className="font-medium text-foreground flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5 text-primary" /> Format guide & templates
                </span>
                {showTemplates ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
              </button>
              {showTemplates && (
                <div className="px-3 pb-3 border-t border-border space-y-3 pt-3">
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p><span className="font-semibold text-foreground">CSV</span> — flat table with one topic per row. Required columns: <code className="font-mono bg-muted px-1 rounded">subject_name</code>, <code className="font-mono bg-muted px-1 rounded">chapter_name</code>, <code className="font-mono bg-muted px-1 rounded">topic_name</code>. Optional: <code className="font-mono bg-muted px-1 rounded">topic_order</code>, <code className="font-mono bg-muted px-1 rounded">chapter_order</code>, <code className="font-mono bg-muted px-1 rounded">subject_order</code>, <code className="font-mono bg-muted px-1 rounded">telegram_url</code>, <code className="font-mono bg-muted px-1 rounded">youtube_url</code>.</p>
                    <p className="mt-1"><span className="font-semibold text-foreground">JSON</span> — nested tree (subjects → chapters → topics) or flat array matching CSV column names.</p>
                    <p className="mt-1 text-primary/80">Existing entries are never duplicated — they are silently skipped.</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8"
                      onClick={() => downloadFile(CSV_TEMPLATE, "syllabus-template.csv", "text/csv")}>
                      <FileSpreadsheet className="w-3.5 h-3.5" /> Download CSV template
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8"
                      onClick={() => downloadFile(JSON_TEMPLATE, "syllabus-template.json", "application/json")}>
                      <FileJson className="w-3.5 h-3.5" /> Download JSON template
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* File picker */}
            {!result && (
              <div className="space-y-1.5">
                <Label>File <span className="text-muted-foreground font-normal text-xs">(CSV or JSON)</span></Label>
                <Input
                  type="file"
                  accept=".csv,.json,text/csv,application/json"
                  ref={fileRef}
                  onChange={handleFile}
                  className="cursor-pointer"
                />
              </div>
            )}

            {/* Parse error */}
            {parseError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{parseError}</span>
              </div>
            )}

            {/* Tree preview */}
            {rows.length > 0 && !result && <TreePreview tree={tree} />}

            {/* Import result */}
            {result && (
              <div className="rounded-lg border border-success/20 bg-success/5 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-success/20 bg-success/10">
                  <CheckCircle className="w-4 h-4 text-success shrink-0" />
                  <span className="text-sm font-semibold text-success">Import complete</span>
                  <span className="ml-auto text-xs text-muted-foreground">{result.totalRows} rows processed</span>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border/30">
                      <th className="px-3 py-2 text-left font-medium">Level</th>
                      <th className="px-3 py-2 text-center font-medium text-success">Created</th>
                      <th className="px-3 py-2 text-center font-medium text-muted-foreground">Skipped (already existed)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {(["subjects", "chapters", "topics"] as const).map((level) => (
                      <tr key={level} className="hover:bg-muted/10">
                        <td className="px-3 py-2 capitalize font-medium">{level}</td>
                        <td className="px-3 py-2 text-center font-bold text-success">{result.created[level]}</td>
                        <td className="px-3 py-2 text-center text-muted-foreground">{result.skipped[level]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => handleClose(false)}>
                {result ? "Close" : "Cancel"}
              </Button>
              {!result && (
                <Button
                  className="flex-1 gap-1.5"
                  onClick={handleImport}
                  disabled={rows.length === 0 || isPending}
                >
                  <Upload className="w-4 h-4" />
                  {isPending ? "Importing…" : `Import ${rows.length} rows`}
                </Button>
              )}
              {result && (
                <Button
                  variant="outline"
                  className="flex-1 gap-1.5"
                  onClick={() => { setResult(null); setRows([]); setParseError(null); if (fileRef.current) fileRef.current.value = ""; }}
                >
                  Import another file
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
        telegramUrl: form.telegramUrl || undefined,
        youtubeUrl: form.youtubeUrl || undefined,
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
        telegramUrl: editTopic.telegramUrl || undefined,
        youtubeUrl: editTopic.youtubeUrl || undefined,
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
              telegramUrl: (topic as any).telegramUrl ?? "",
              youtubeUrl: (topic as any).youtubeUrl ?? "",
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
        <div className="space-y-1.5">
          <Label className="text-xs">Direct Telegram URL (optional)</Label>
          <Input value={form.telegramUrl} onChange={e => setForm({ telegramUrl: e.target.value })} placeholder="https://t.me/c/..." />
        </div>
      </div>
      <div className="border border-border/50 rounded-lg p-3 space-y-2 bg-muted/20">
        <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
          <Link2 className="w-3.5 h-3.5" /> YouTube Lecture Link (optional)
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">YouTube URL</Label>
          <Input value={form.youtubeUrl} onChange={e => setForm({ youtubeUrl: e.target.value })} placeholder="https://youtube.com/watch?v=..." />
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
