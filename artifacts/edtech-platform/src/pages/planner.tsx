import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarDays, ChevronLeft, ChevronRight, Sparkles, CheckCircle2,
  Circle, BookOpen, AlertTriangle, Loader2, RotateCcw, Target,
  Clock, CalendarCheck, Brain, Flame, ExternalLink, Trash2, GripVertical,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "completed" | "skipped";
  source: "auto" | "manual";
  topicId: string | null;
  topicName: string | null;
  chapterName: string | null;
  subjectName: string | null;
  scheduledDate: string;
  sortOrder: number;
};

type GenerateResult = {
  tasksCreated: number;
  daysPlanned: number;
  topicsCovered: number;
  totalTopics: number;
  completedTopics: number;
  weakTopicsFound: number;
  examDate: string;
  daysUntilExam: number;
  revisionDays: number;
  firstTaskDate: string | null;
  lastTaskDate: string | null;
};

type PlanConfig = {
  examDate: string;
  dailyStudyHours: number;
  targetScore: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CONFIG_KEY = "edtech_planner_config";

function toDateStr(d: Date) { return d.toISOString().split("T")[0]; }

function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

function weekStart(d: Date) {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay());
  r.setHours(0, 0, 0, 0);
  return r;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtDate(d: Date) {
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

function daysUntil(dateStr: string) {
  const d = new Date(dateStr);
  d.setHours(0,0,0,0);
  const t = new Date(); t.setHours(0,0,0,0);
  return Math.ceil((d.getTime() - t.getTime()) / 86_400_000);
}

function loadConfig(): PlanConfig | null {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY) ?? "null"); } catch { return null; }
}
function saveConfig(c: PlanConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
}

// ─── Supabase API helpers ──────────────────────────────────────────────────────

async function fetchTasksRange(startDate: string, endDate: string): Promise<Task[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, description, status, source, topic_id, scheduled_date, sort_order, topics(name, chapters(name, subjects(name)))")
    .eq("user_id", user.id)
    .gte("scheduled_date", startDate)
    .lte("scheduled_date", endDate)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((t: any) => ({
    id: t.id,
    title: t.title,
    description: t.description ?? null,
    status: t.status,
    source: t.source,
    topicId: t.topic_id ?? null,
    topicName: t.topics?.name ?? null,
    chapterName: t.topics?.chapters?.name ?? null,
    subjectName: t.topics?.chapters?.subjects?.name ?? null,
    scheduledDate: t.scheduled_date,
    sortOrder: t.sort_order ?? 0,
  }));
}

async function patchTask(taskId: string, status: Task["status"]): Promise<void> {
  const { error } = await supabase
    .from("tasks")
    .update({ status })
    .eq("id", taskId);
  if (error) throw new Error(error.message);
}

async function reorderTask(taskId: string, sortOrder: number): Promise<void> {
  const { error } = await supabase
    .from("tasks")
    .update({ sort_order: sortOrder })
    .eq("id", taskId);
  if (error) throw new Error(error.message);
}

async function deleteTask(taskId: string): Promise<void> {
  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", taskId);
  if (error) throw new Error(error.message);
}

async function generatePlan(config: PlanConfig): Promise<GenerateResult> {
  const { data, error } = await supabase.functions.invoke("generate-study-plan", {
    body: config,
  });
  if (error) throw new Error(error.message ?? "Failed to generate plan");
  if (data?.error) throw new Error(data.error);
  return data;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TaskCard({ task, onToggle, onDelete, dragHandleProps }: {
  task: Task;
  onToggle: (t: Task) => void;
  onDelete: (id: string) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
}) {
  const done = task.status === "completed";
  const isRevision = task.title.startsWith("[Revision]");

  return (
    <div className={`group flex gap-2.5 p-3 rounded-lg border transition-colors
      ${done
        ? "bg-success/5 border-success/20"
        : isRevision
          ? "bg-warning/5 border-warning/20 hover:bg-warning/10"
          : "bg-background border-border hover:bg-muted/30"
      }`}>
      <button
        onClick={() => onToggle(task)}
        className="mt-0.5 shrink-0"
        aria-label={done ? "Mark pending" : "Mark complete"}
      >
        {done
          ? <CheckCircle2 className="w-4 h-4 text-success" />
          : <Circle className="w-4 h-4 text-muted-foreground hover:text-primary transition-colors" />
        }
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium leading-snug ${done ? "line-through text-muted-foreground" : "text-foreground"}`}>
          {task.title.replace("[Revision] ", "")}
        </p>
        {task.subjectName && (
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{task.subjectName}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {isRevision && (
            <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-warning/10 text-warning border-warning/20">
              <RotateCcw className="w-2 h-2 mr-0.5" /> Revision
            </Badge>
          )}
          {task.source === "auto" && !isRevision && (
            <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-primary/10 text-primary border-primary/20">
              <Sparkles className="w-2 h-2 mr-0.5" /> Smart
            </Badge>
          )}
          {task.topicId && (
            <Link href={`/topics/${task.topicId}`}>
              <span className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                Study <ExternalLink className="w-2.5 h-2.5" />
              </span>
            </Link>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        {dragHandleProps && (
          <button
            {...dragHandleProps}
            className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
            aria-label="Drag to reorder"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={() => onDelete(task.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
          aria-label="Delete task"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function SortableTaskCard({ task, onToggle, onDelete }: {
  task: Task;
  onToggle: (t: Task) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <TaskCard task={task} onToggle={onToggle} onDelete={onDelete} dragHandleProps={{ ...attributes, ...listeners } as any} />
    </div>
  );
}

function GenerateDialog({ onGenerated }: { onGenerated: (r: GenerateResult) => void }) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<PlanConfig>(() => {
    const saved = loadConfig();
    const def30 = toDateStr(addDays(new Date(), 30));
    return saved ?? { examDate: def30, dailyStudyHours: 4, targetScore: 70 };
  });
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const tomorrow = toDateStr(addDays(new Date(), 1));

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const r = await generatePlan(config);
      saveConfig(config);
      setResult(r);
      onGenerated(r);
    } catch (e: any) {
      toast({ title: "Generation failed", description: e.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setResult(null);
  };

  const du = config.examDate ? daysUntil(config.examDate) : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setResult(null); }}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Sparkles className="w-4 h-4" /> Generate Plan
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" /> Smart Study Plan
          </DialogTitle>
        </DialogHeader>

        {!result ? (
          <div className="space-y-5 pt-2">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" /> Exam Date
              </Label>
              <Input
                type="date"
                min={tomorrow}
                value={config.examDate}
                onChange={(e) => setConfig({ ...config, examDate: e.target.value })}
              />
              {du > 0 && (
                <p className="text-xs text-muted-foreground">{du} days until exam</p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                Daily Study Hours
                <span className="ml-auto font-bold text-foreground text-sm">{config.dailyStudyHours}h</span>
              </Label>
              <input
                type="range" min={1} max={12} step={0.5}
                value={config.dailyStudyHours}
                onChange={(e) => setConfig({ ...config, dailyStudyHours: parseFloat(e.target.value) })}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>1h (light)</span><span>6h (moderate)</span><span>12h (intensive)</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-muted-foreground" />
                Target Score
                <span className="ml-auto font-bold text-foreground text-sm">{config.targetScore}%</span>
              </Label>
              <input
                type="range" min={40} max={100} step={5}
                value={config.targetScore}
                onChange={(e) => setConfig({ ...config, targetScore: parseInt(e.target.value) })}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>40% (pass)</span><span>70% (good)</span><span>100% (top)</span>
              </div>
              {config.targetScore >= 85 && (
                <p className="text-xs text-warning flex items-center gap-1">
                  <Flame className="w-3 h-3" /> High target — completed topics will also be scheduled for revision.
                </p>
              )}
            </div>

            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="pt-3 pb-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The planner will analyse your progress, identify weak topics, and spread study
                  sessions across available days. The final {Math.ceil(du * 0.2)} days are reserved for targeted revision.
                  All previously auto-generated tasks will be replaced.
                </p>
              </CardContent>
            </Card>

            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !config.examDate || du < 1}
              className="w-full"
            >
              {isGenerating
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analysing your progress…</>
                : <><Sparkles className="w-4 h-4 mr-2" /> Generate My Plan</>
              }
            </Button>
          </div>
        ) : (
          <div className="space-y-5 pt-2">
            <div className="text-center space-y-1">
              <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-3">
                <CalendarCheck className="w-8 h-8 text-success" />
              </div>
              <h3 className="text-xl font-bold">Plan Generated!</h3>
              <p className="text-sm text-muted-foreground">
                Your personalised study schedule is ready.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Tasks Created", value: result.tasksCreated, icon: <CheckCircle2 className="w-4 h-4 text-success" /> },
                { label: "Days Planned",  value: result.daysPlanned,  icon: <CalendarDays className="w-4 h-4 text-primary" /> },
                { label: "Topics Covered",value: `${result.topicsCovered}/${result.totalTopics}`, icon: <BookOpen className="w-4 h-4 text-secondary" /> },
                { label: "Weak Topics",   value: result.weakTopicsFound, icon: <AlertTriangle className="w-4 h-4 text-warning" /> },
              ].map((stat) => (
                <div key={stat.label} className="bg-muted/30 rounded-lg p-3 flex items-center gap-2.5">
                  {stat.icon}
                  <div>
                    <div className="font-bold text-foreground">{stat.value}</div>
                    <div className="text-[10px] text-muted-foreground">{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {result.revisionDays > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/5 border border-warning/20 text-xs text-warning">
                <Flame className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  The final <strong>{result.revisionDays} days</strong> before your exam are reserved for revising{" "}
                  {result.weakTopicsFound > 0 ? `your ${result.weakTopicsFound} weak topic${result.weakTopicsFound > 1 ? "s" : ""}` : "key topics"}.
                </span>
              </div>
            )}

            <Button onClick={handleClose} className="w-full">View My Schedule</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Planner() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [weekOffset, setWeekOffset] = useState(0);

  const wsDate = weekStart(addDays(new Date(), weekOffset * 7));
  const weDate = addDays(wsDate, 6);
  const startDate = toDateStr(wsDate);
  const endDate   = toDateStr(weDate);

  const savedConfig = loadConfig();
  const today = toDateStr(new Date());

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["tasks-range", startDate, endDate],
    queryFn: () => fetchTasksRange(startDate, endDate),
    staleTime: 30_000,
  });

  const [localTasks, setLocalTasks] = useState<Task[]>([]);
  useEffect(() => { setLocalTasks(tasks); }, [tasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const toggleMutation = useMutation({
    mutationFn: (task: Task) =>
      patchTask(task.id, task.status === "completed" ? "pending" : "completed"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks-range"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks-range"] });
      toast({ title: "Task removed" });
    },
  });

  const handleDragEnd = useCallback((event: DragEndEvent, dateStr: string) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setLocalTasks((prev) => {
      const dayTasks = prev.filter((t) => t.scheduledDate === dateStr).sort((a, b) => a.sortOrder - b.sortOrder);
      const oldIdx = dayTasks.findIndex((t) => t.id === active.id);
      const newIdx = dayTasks.findIndex((t) => t.id === over.id);
      if (oldIdx === -1 || newIdx === -1) return prev;
      const reordered = arrayMove(dayTasks, oldIdx, newIdx);
      const otherTasks = prev.filter((t) => t.scheduledDate !== dateStr);
      const updated = reordered.map((t, i) => ({ ...t, sortOrder: i }));
      updated.forEach((t) => { reorderTask(t.id, t.sortOrder).catch(() => {}); });
      return [...otherTasks, ...updated];
    });
  }, []);

  const handleGenerated = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["tasks-range"] });
  }, [qc]);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(wsDate, i);
    const ds = toDateStr(d);
    return {
      date: d,
      dateStr: ds,
      isToday: ds === today,
      label: DAY_LABELS[d.getDay()],
      tasks: localTasks.filter((t) => t.scheduledDate === ds).sort((a, b) => a.sortOrder - b.sortOrder),
    };
  });

  const weekCompleted = localTasks.filter((t) => t.status === "completed").length;
  const weekTotal = localTasks.length;
  const weekPct = weekTotal > 0 ? Math.round((weekCompleted / weekTotal) * 100) : 0;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6 pb-24 md:pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2.5">
            <CalendarDays className="w-7 h-7 text-primary" /> Study Planner
          </h1>
          <p className="text-muted-foreground mt-1">
            {savedConfig
              ? <>Exam on <strong className="text-foreground">{new Date(savedConfig.examDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</strong> — {daysUntil(savedConfig.examDate)} days away</>
              : "Generate a smart plan tailored to your weak topics and exam date."
            }
          </p>
        </div>
        <GenerateDialog onGenerated={handleGenerated} />
      </div>

      {weekTotal > 0 && (
        <Card className="border-card-border bg-card">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-6 flex-wrap text-sm">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  <span className="font-semibold text-foreground">{weekCompleted}</span>
                  <span className="text-muted-foreground">/ {weekTotal} done this week</span>
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Sparkles className="w-4 h-4 text-primary" />
                  {localTasks.filter((t) => t.source === "auto").length} smart tasks
                </span>
              </div>
              <div className="flex items-center gap-3 min-w-[160px]">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-success rounded-full transition-all duration-500"
                    style={{ width: `${weekPct}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-foreground w-9 text-right">{weekPct}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between gap-4">
        <Button variant="outline" size="sm" onClick={() => setWeekOffset((p) => p - 1)}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Prev
        </Button>
        <div className="text-sm font-medium text-foreground">
          {fmtDate(wsDate)} — {fmtDate(weDate)}, {weDate.getFullYear()}
          {weekOffset === 0 && <span className="ml-2 text-xs text-primary">(this week)</span>}
        </div>
        <Button variant="outline" size="sm" onClick={() => setWeekOffset((p) => p + 1)}>
          Next <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading schedule…
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          {days.map((day) => {
            const done  = day.tasks.filter((t) => t.status === "completed").length;
            const total = day.tasks.length;
            const allDone = total > 0 && done === total;

            return (
              <div
                key={day.dateStr}
                className={`rounded-xl border flex flex-col overflow-hidden
                  ${day.isToday
                    ? "border-primary/50 ring-1 ring-primary/30 bg-primary/5"
                    : "border-border bg-card"
                  }`}
              >
                <div className={`px-3 py-2.5 border-b flex items-center justify-between
                  ${day.isToday ? "border-primary/30 bg-primary/10" : "border-border bg-muted/30"}`}>
                  <div>
                    <p className={`text-xs font-semibold uppercase tracking-wide
                      ${day.isToday ? "text-primary" : "text-muted-foreground"}`}>
                      {day.label}
                    </p>
                    <p className={`text-lg font-bold leading-tight
                      ${day.isToday ? "text-primary" : "text-foreground"}`}>
                      {day.date.getDate()}
                    </p>
                  </div>
                  {total > 0 && (
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                      ${allDone ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"}`}>
                      {allDone ? <CheckCircle2 className="w-4 h-4" /> : `${done}/${total}`}
                    </div>
                  )}
                </div>

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(e) => handleDragEnd(e, day.dateStr)}
                >
                  <SortableContext
                    items={day.tasks.map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="flex-1 p-2 space-y-2 min-h-[120px]">
                      {day.tasks.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center py-6 text-center">
                          <Circle className="w-5 h-5 text-muted-foreground/30 mb-1.5" />
                          <p className="text-[11px] text-muted-foreground/60">
                            {weekOffset === 0 && day.dateStr < today ? "No tasks" : "Free day"}
                          </p>
                        </div>
                      ) : (
                        day.tasks.map((task) => (
                          <SortableTaskCard
                            key={task.id}
                            task={task}
                            onToggle={(t) => toggleMutation.mutate(t)}
                            onDelete={(id) => deleteMutation.mutate(id)}
                          />
                        ))
                      )}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && weekTotal === 0 && !savedConfig && (
        <Card className="border-dashed border-primary/30 bg-primary/5">
          <CardContent className="py-14 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Brain className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-semibold">No schedule yet</h3>
              <p className="text-muted-foreground mt-1.5 max-w-xs mx-auto text-sm">
                Click <strong>Generate Plan</strong> above to auto-build your daily study schedule
                based on your weak topics, exam date, and daily availability.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4 max-w-md mx-auto text-center text-xs text-muted-foreground pt-2">
              <div className="space-y-1.5">
                <AlertTriangle className="w-5 h-5 text-warning mx-auto" />
                <p>Prioritises weak topics first</p>
              </div>
              <div className="space-y-1.5">
                <CalendarDays className="w-5 h-5 text-primary mx-auto" />
                <p>Spreads work across available days</p>
              </div>
              <div className="space-y-1.5">
                <Flame className="w-5 h-5 text-orange-400 mx-auto" />
                <p>Reserves final days for revision</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {weekTotal > 0 && (
        <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary/40 inline-block" /> Smart (auto-scheduled)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-warning/60 inline-block" /> Revision
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-success/60 inline-block" /> Completed
          </span>
          <span className="ml-auto flex items-center gap-1">
            Click a task's circle to toggle completion · Hover to delete
          </span>
        </div>
      )}
    </div>
  );
}
