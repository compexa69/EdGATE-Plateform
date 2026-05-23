import {
  useAdminListExams as useListExams,
  useCreateExam,
  useDeleteExam,
  useListExamQuestions,
  useAddExamQuestion,
  useRemoveExamQuestion,
} from "@/hooks/use-exams";
import { useListSubjects, useListChapters, useListTopics } from "@/hooks/use-subjects";
import { useListQuestions } from "@/hooks/use-admin";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, BookOpen, ChevronRight, ListChecks, X } from "lucide-react";

const EXAM_TYPES = ["lecture_quiz", "dpp", "pyq", "topic_test", "chapter_test", "subject_test", "grand_test"] as const;
type ExamType = typeof EXAM_TYPES[number];

const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  lecture_quiz: "Lecture Quiz",
  dpp: "DPP",
  pyq: "PYQ",
  topic_test: "Topic Test",
  chapter_test: "Chapter Test",
  subject_test: "Subject Test",
  grand_test: "Grand Test",
};

type CreateForm = {
  title: string;
  type: ExamType;
  subjectId: string;
  chapterId: string;
  topicId: string;
  durationMinutes: string;
  passingScore: string;
  negativeMarking: string;
};

const DEFAULT_FORM: CreateForm = {
  title: "",
  type: "topic_test",
  subjectId: "",
  chapterId: "",
  topicId: "",
  durationMinutes: "60",
  passingScore: "",
  negativeMarking: "1",
};

function QuestionsPanel({
  examId,
  examTitle,
  onClose,
}: {
  examId: string;
  examTitle: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [qSearch, setQSearch] = useState("");
  const { data: examQuestions = [], refetch: refetchExamQ } = useListExamQuestions(examId);
  const { data: allQuestions = [] } = useListQuestions();
  const addMutation = useAddExamQuestion();
  const removeMutation = useRemoveExamQuestion();

  const assignedIds = new Set(examQuestions.map((q) => q.id));
  const filtered = allQuestions.filter(
    (q) =>
      !assignedIds.has(q.id) &&
      (qSearch === "" || q.text.toLowerCase().includes(qSearch.toLowerCase()))
  );

  const handleAdd = (questionId: string) => {
    addMutation.mutate(
      { examId, data: { questionId, order: examQuestions.length + 1 } },
      {
        onSuccess: () => { refetchExamQ(); },
        onError: () => toast({ title: "Failed to add question", variant: "destructive" }),
      }
    );
  };

  const handleRemove = (questionId: string) => {
    removeMutation.mutate(
      { examId, questionId },
      {
        onSuccess: () => { refetchExamQ(); },
        onError: () => toast({ title: "Failed to remove question", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Manage Questions</h2>
          <p className="text-muted-foreground text-sm">{examTitle}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Assigned questions */}
        <div>
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
            Assigned ({examQuestions.length})
          </h3>
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {examQuestions.length === 0 ? (
              <p className="text-muted-foreground text-sm p-2">No questions assigned yet.</p>
            ) : (
              examQuestions.map((q, idx) => (
                <div
                  key={q.id}
                  className="flex items-start gap-3 bg-muted/40 rounded-lg p-3 group"
                >
                  <span className="text-xs text-muted-foreground font-mono shrink-0 mt-0.5">Q{idx + 1}</span>
                  <p className="text-sm flex-1 line-clamp-2">{q.text}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/10 shrink-0"
                    onClick={() => handleRemove(q.id)}
                    disabled={removeMutation.isPending}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Available questions */}
        <div>
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
            Available ({filtered.length})
          </h3>
          <Input
            placeholder="Search questions..."
            value={qSearch}
            onChange={(e) => setQSearch(e.target.value)}
            className="mb-3 h-8 text-sm"
          />
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {filtered.slice(0, 50).map((q) => (
              <div
                key={q.id}
                className="flex items-start gap-3 bg-muted/20 rounded-lg p-3 hover:bg-muted/40 transition-colors group cursor-pointer"
                onClick={() => handleAdd(q.id)}
              >
                <p className="text-sm flex-1 line-clamp-2">{q.text}</p>
                <Plus className="w-4 h-4 shrink-0 text-primary opacity-0 group-hover:opacity-100 mt-0.5" />
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-muted-foreground text-sm p-2">No questions available.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminExams() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(DEFAULT_FORM);
  const [managingExam, setManagingExam] = useState<{ id: string; title: string } | null>(null);

  const { data: exams = [], refetch } = useListExams({}, { query: { queryKey: ["admin-exams"] } });
  const { data: subjects = [] } = useListSubjects({ query: { queryKey: ["subjects"] } });
  const { data: chapters = [] } = useListChapters(form.subjectId || "none", {
    query: { enabled: !!form.subjectId, queryKey: ["chapters", form.subjectId] },
  });
  const { data: topics = [] } = useListTopics(form.chapterId || "none", {
    query: { enabled: !!form.chapterId, queryKey: ["topics", form.chapterId] },
  });

  const createMutation = useCreateExam();
  const deleteMutation = useDeleteExam();

  const set = (field: keyof CreateForm) => (val: string) =>
    setForm((prev) => ({ ...prev, [field]: val }));

  const handleCreate = () => {
    if (!form.title) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    createMutation.mutate(
      {
        data: {
          title: form.title,
          type: form.type,
          subjectId: form.subjectId || undefined,
          chapterId: form.chapterId || undefined,
          topicId: form.topicId || undefined,
          durationMinutes: parseInt(form.durationMinutes) || 60,
          passingScore: form.passingScore ? parseInt(form.passingScore) : undefined,
          negativeMarking: parseFloat(form.negativeMarking) || 1,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Exam created" });
          setForm(DEFAULT_FORM);
          setCreateOpen(false);
          refetch();
        },
        onError: () => toast({ title: "Failed to create exam", variant: "destructive" }),
      }
    );
  };

  const handleDelete = (examId: string) => {
    if (!window.confirm("Delete this exam and all its attempts? This cannot be undone.")) return;
    deleteMutation.mutate(
      { examId },
      {
        onSuccess: () => { toast({ title: "Exam deleted" }); refetch(); },
        onError: () => toast({ title: "Failed to delete exam", variant: "destructive" }),
      }
    );
  };

  if (managingExam) {
    return (
      <div className="p-6 md:p-8 max-w-5xl mx-auto pb-24 md:pb-8">
        <button
          className="text-sm text-primary hover:underline flex items-center gap-1 mb-6"
          onClick={() => setManagingExam(null)}
        >
          <ChevronRight className="w-4 h-4 rotate-180" /> Back to Exams
        </button>
        <Card className="bg-card border-card-border">
          <CardContent className="p-6">
            <QuestionsPanel
              examId={managingExam.id}
              examTitle={managingExam.title}
              onClose={() => setManagingExam(null)}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8 pb-24 md:pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Exam Management</h1>
          <p className="text-muted-foreground mt-1">Create exams and assign questions</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="w-4 h-4" /> New Exam
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Exam</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label>Title *</Label>
                <Input placeholder="e.g. Mechanics Topic Test" value={form.title} onChange={(e) => set("title")(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={set("type")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EXAM_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{EXAM_TYPE_LABELS[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Duration (min)</Label>
                  <Input type="number" value={form.durationMinutes} onChange={(e) => set("durationMinutes")(e.target.value)} />
                </div>

                <div className="space-y-1">
                  <Label>Passing Score</Label>
                  <Input type="number" placeholder="Optional" value={form.passingScore} onChange={(e) => set("passingScore")(e.target.value)} />
                </div>

                <div className="space-y-1">
                  <Label>Negative Marking</Label>
                  <Input type="number" step="0.25" value={form.negativeMarking} onChange={(e) => set("negativeMarking")(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Subject (optional)</Label>
                <Select value={form.subjectId || "none"} onValueChange={(v) => { set("subjectId")(v === "none" ? "" : v); set("chapterId")(""); set("topicId")(""); }}>
                  <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {form.subjectId && (
                <div className="space-y-1">
                  <Label>Chapter (optional)</Label>
                  <Select value={form.chapterId || "none"} onValueChange={(v) => { set("chapterId")(v === "none" ? "" : v); set("topicId")(""); }}>
                    <SelectTrigger><SelectValue placeholder="Select chapter" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {chapters.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {form.chapterId && (
                <div className="space-y-1">
                  <Label>Topic (optional)</Label>
                  <Select value={form.topicId || "none"} onValueChange={(v) => set("topicId")(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Select topic" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {topics.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button className="w-full" onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating…" : "Create Exam"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {exams.length === 0 ? (
        <Card className="bg-card border-card-border">
          <CardContent className="p-12 text-center text-muted-foreground">
            <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">No exams created yet</p>
            <p className="text-sm mt-1">Click "New Exam" to create your first exam.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {exams.map((exam) => (
            <Card key={exam.id} className="bg-card border-card-border hover:border-primary/30 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base font-semibold line-clamp-2">{exam.title}</CardTitle>
                  <Badge variant="outline" className="text-xs shrink-0">{EXAM_TYPE_LABELS[exam.type as ExamType] ?? exam.type}</Badge>
                </div>
                <CardDescription className="text-xs">
                  {exam.durationMinutes}min · {exam.negativeMarking}× penalty
                  {exam.passingScore ? ` · Pass: ${exam.passingScore}pts` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 text-xs"
                  onClick={() => setManagingExam({ id: exam.id, title: exam.title })}
                >
                  <ListChecks className="w-3.5 h-3.5" /> Questions
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
                  onClick={() => handleDelete(exam.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
