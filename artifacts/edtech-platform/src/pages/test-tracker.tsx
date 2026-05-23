import { useListExternalTests, useCreateExternalTest, useDeleteExternalTest } from "@/hooks/use-tasks";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, TrendingUp, Target, Award, BarChart2 } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Legend,
} from "recharts";

const EXAM_TYPE_LABELS: Record<string, string> = {
  jee_main: "JEE Main",
  jee_advanced: "JEE Advanced",
  neet: "NEET",
  gate: "GATE",
  bitsat: "BITSAT",
  viteee: "VITEEE",
  other: "Other",
};

type FormData = {
  examName: string;
  examType: string;
  score: string;
  maxScore: string;
  totalQuestions: string;
  correctAnswers: string;
  incorrectAnswers: string;
  skippedAnswers: string;
  rank: string;
  percentile: string;
  attemptedAt: string;
  notes: string;
};

const DEFAULT_FORM: FormData = {
  examName: "",
  examType: "other",
  score: "",
  maxScore: "",
  totalQuestions: "",
  correctAnswers: "",
  incorrectAnswers: "",
  skippedAnswers: "",
  rank: "",
  percentile: "",
  attemptedAt: new Date().toISOString().split("T")[0],
  notes: "",
};

export default function TestTracker() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);

  const { data: tests = [], refetch } = useListExternalTests({
    query: { queryKey: ["external-tests"] },
  });
  const createMutation = useCreateExternalTest();
  const deleteMutation = useDeleteExternalTest();

  const scorePercent = (t: { score: number; maxScore: number }) =>
    Math.round((t.score / t.maxScore) * 100);

  const chartData = [...tests]
    .sort((a, b) => new Date(a.attemptedAt).getTime() - new Date(b.attemptedAt).getTime())
    .map((t) => ({
      date: new Date(t.attemptedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      Score: scorePercent(t),
      name: t.examName,
    }));

  const avgScore = tests.length
    ? Math.round(tests.reduce((s, t) => s + scorePercent(t), 0) / tests.length)
    : 0;

  const bestScore = tests.length
    ? Math.max(...tests.map(scorePercent))
    : 0;

  const handleSubmit = () => {
    if (!form.examName || !form.score || !form.maxScore || !form.attemptedAt) {
      toast({ title: "Exam name, score, max score and date are required.", variant: "destructive" });
      return;
    }
    createMutation.mutate(
      {
        data: {
          examName: form.examName,
          examType: form.examType as any,
          score: parseFloat(form.score),
          maxScore: parseFloat(form.maxScore),
          totalQuestions: form.totalQuestions ? parseInt(form.totalQuestions) : undefined,
          correctAnswers: form.correctAnswers ? parseInt(form.correctAnswers) : undefined,
          incorrectAnswers: form.incorrectAnswers ? parseInt(form.incorrectAnswers) : undefined,
          skippedAnswers: form.skippedAnswers ? parseInt(form.skippedAnswers) : undefined,
          rank: form.rank ? parseInt(form.rank) : undefined,
          percentile: form.percentile ? parseFloat(form.percentile) : undefined,
          attemptedAt: new Date(form.attemptedAt).toISOString(),
          notes: form.notes || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Test result logged!" });
          setForm(DEFAULT_FORM);
          setOpen(false);
          refetch();
        },
        onError: () => toast({ title: "Failed to log result", variant: "destructive" }),
      }
    );
  };

  const handleDelete = (testId: string) => {
    deleteMutation.mutate(
      { testId },
      {
        onSuccess: () => {
          toast({ title: "Entry deleted" });
          refetch();
        },
        onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
      }
    );
  };

  const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8 pb-24 md:pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Test Tracker</h1>
          <p className="text-muted-foreground mt-1">Log and track your external exam performance</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="w-4 h-4" /> Log Result
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Log External Test Result</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1">
                  <Label>Exam Name *</Label>
                  <Input placeholder="e.g. JEE Main Jan 2025" value={form.examName} onChange={set("examName")} />
                </div>
                <div className="space-y-1">
                  <Label>Exam Type</Label>
                  <Select value={form.examType} onValueChange={(v) => setForm((p) => ({ ...p, examType: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(EXAM_TYPE_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Date *</Label>
                  <Input type="date" value={form.attemptedAt} onChange={set("attemptedAt")} />
                </div>
                <div className="space-y-1">
                  <Label>Score *</Label>
                  <Input type="number" placeholder="240" value={form.score} onChange={set("score")} />
                </div>
                <div className="space-y-1">
                  <Label>Max Score *</Label>
                  <Input type="number" placeholder="300" value={form.maxScore} onChange={set("maxScore")} />
                </div>
                <div className="space-y-1">
                  <Label>Total Questions</Label>
                  <Input type="number" placeholder="90" value={form.totalQuestions} onChange={set("totalQuestions")} />
                </div>
                <div className="space-y-1">
                  <Label>Correct</Label>
                  <Input type="number" value={form.correctAnswers} onChange={set("correctAnswers")} />
                </div>
                <div className="space-y-1">
                  <Label>Incorrect</Label>
                  <Input type="number" value={form.incorrectAnswers} onChange={set("incorrectAnswers")} />
                </div>
                <div className="space-y-1">
                  <Label>Skipped</Label>
                  <Input type="number" value={form.skippedAnswers} onChange={set("skippedAnswers")} />
                </div>
                <div className="space-y-1">
                  <Label>Rank</Label>
                  <Input type="number" placeholder="1250" value={form.rank} onChange={set("rank")} />
                </div>
                <div className="space-y-1">
                  <Label>Percentile</Label>
                  <Input type="number" placeholder="95.2" value={form.percentile} onChange={set("percentile")} />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>Notes</Label>
                  <Input placeholder="e.g. Maths was tough this time" value={form.notes} onChange={set("notes")} />
                </div>
              </div>
              <Button className="w-full" onClick={handleSubmit} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Saving…" : "Save Result"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-card-border">
          <CardContent className="p-5 flex items-center gap-4">
            <BarChart2 className="w-8 h-8 text-primary shrink-0" />
            <div>
              <div className="text-2xl font-bold">{tests.length}</div>
              <div className="text-xs text-muted-foreground">Total Tests</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-card-border">
          <CardContent className="p-5 flex items-center gap-4">
            <Target className="w-8 h-8 text-secondary shrink-0" />
            <div>
              <div className="text-2xl font-bold">{avgScore}%</div>
              <div className="text-xs text-muted-foreground">Avg Score</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-card-border">
          <CardContent className="p-5 flex items-center gap-4">
            <Award className="w-8 h-8 text-warning shrink-0" />
            <div>
              <div className="text-2xl font-bold">{bestScore}%</div>
              <div className="text-xs text-muted-foreground">Best Score</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-card-border">
          <CardContent className="p-5 flex items-center gap-4">
            <TrendingUp className="w-8 h-8 text-success shrink-0" />
            <div>
              <div className="text-2xl font-bold">
                {tests.length >= 2
                  ? `${scorePercent(tests[0]) >= scorePercent(tests[tests.length - 1]) ? "+" : ""}${scorePercent(tests[0]) - scorePercent(tests[tests.length - 1])}%`
                  : "—"}
              </div>
              <div className="text-xs text-muted-foreground">Latest Δ</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      {chartData.length > 1 && (
        <Card className="bg-card border-card-border">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Score Trend (%)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} unit="%" />
                <RechartsTooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                  itemStyle={{ color: "hsl(var(--foreground))" }}
                  formatter={(v: number) => [`${v}%`, "Score"]}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="Score"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ fill: "hsl(var(--primary))", r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card className="bg-card border-card-border">
        <CardHeader>
          <CardTitle className="text-base font-semibold">All Results</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {tests.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No results logged yet. Click "Log Result" to add your first external test.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-4 text-muted-foreground font-medium">Exam</th>
                    <th className="text-left p-4 text-muted-foreground font-medium">Type</th>
                    <th className="text-left p-4 text-muted-foreground font-medium">Date</th>
                    <th className="text-left p-4 text-muted-foreground font-medium">Score</th>
                    <th className="text-left p-4 text-muted-foreground font-medium">%</th>
                    <th className="text-left p-4 text-muted-foreground font-medium">Rank</th>
                    <th className="text-left p-4 text-muted-foreground font-medium">Percentile</th>
                    <th className="p-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {tests.map((t) => (
                    <tr key={t.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                      <td className="p-4 font-medium">{t.examName}</td>
                      <td className="p-4">
                        <Badge variant="outline" className="text-xs">{EXAM_TYPE_LABELS[t.examType] ?? t.examType}</Badge>
                      </td>
                      <td className="p-4 text-muted-foreground">
                        {new Date(t.attemptedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="p-4 font-mono">
                        {t.score} / {t.maxScore}
                      </td>
                      <td className="p-4">
                        <span className={`font-bold ${scorePercent(t) >= 75 ? "text-success" : scorePercent(t) >= 50 ? "text-warning" : "text-destructive"}`}>
                          {scorePercent(t)}%
                        </span>
                      </td>
                      <td className="p-4 text-muted-foreground">{t.rank ?? "—"}</td>
                      <td className="p-4 text-muted-foreground">{t.percentile != null ? `${t.percentile}` : "—"}</td>
                      <td className="p-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
                          onClick={() => handleDelete(t.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
