import { useGetResult } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronRight, CheckCircle2, XCircle, MinusCircle, Trophy, Target, Clock, AlertTriangle, QrCode, Video, ExternalLink, Filter, Zap, RefreshCw } from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";
import { useState } from "react";
import { useLocation } from "wouter";
import { MathText } from "@/components/math-text";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type AnswerFilter = "all" | "incorrect" | "skipped";

export default function ExamResults() {
  const params = useParams();
  const resultId = params.resultId!;
  const [answerFilter, setAnswerFilter] = useState<AnswerFilter>("all");
  const [isDrilling, setIsDrilling] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: result, isLoading } = useGetResult(resultId, {
    query: { enabled: !!resultId, queryKey: ["result", resultId] }
  });

  if (isLoading) return <div className="p-8">Loading results...</div>;
  if (!result) return <div className="p-8 text-destructive">Result not found</div>;

  const examType = (result as any).examType as string;
  const canDrill = !result.passed && result.incorrectAnswers > 0 && examType !== "drill";

  const handleStartDrill = async () => {
    setIsDrilling(true);
    try {
      const res = await fetch(`/api/results/${resultId}/drill`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        toast({ title: "Drill unavailable", description: err.error, variant: "destructive" });
        return;
      }
      const { drillExamId } = await res.json();
      setLocation(`/exam/${drillExamId}`);
    } catch {
      toast({ title: "Failed to start drill", variant: "destructive" });
    } finally {
      setIsDrilling(false);
    }
  };

  const questionsWithVideo = result.questionWise.filter((q) => (q as any).videoUrl || (q as any).qrCodeSvg);
  const hasVideoContent = questionsWithVideo.length > 0;

  const filteredQuestions = result.questionWise.filter((q) => {
    if (answerFilter === "incorrect") return !q.isCorrect && q.selectedOption !== null;
    if (answerFilter === "skipped") return q.selectedOption === null;
    return true;
  });

  const pieData = [
    { name: "Correct", value: result.correctAnswers, color: "hsl(var(--success))" },
    { name: "Incorrect", value: result.incorrectAnswers, color: "hsl(var(--destructive))" },
    { name: "Skipped", value: result.skippedAnswers, color: "hsl(var(--muted-foreground))" },
  ].filter((d) => d.value > 0);

  const barData = result.topicWise.map((t) => ({
    name: t.topicName.length > 14 ? t.topicName.slice(0, 14) + "…" : t.topicName,
    Accuracy: t.accuracy,
    Correct: t.correctAnswers,
    Total: t.totalQuestions,
  }));

  const filterBtnClass = (f: AnswerFilter) =>
    `px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
      answerFilter === f
        ? "bg-primary text-primary-foreground"
        : "bg-muted text-muted-foreground hover:bg-muted/80"
    }`;

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8 pb-24 md:pb-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Link href="/dashboard" className="text-sm text-primary hover:underline flex items-center gap-1 w-fit mb-2">
            <ChevronRight className="w-4 h-4 rotate-180" /> Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Exam Analysis</h1>
          <p className="text-muted-foreground">{result.examTitle}</p>
        </div>
        {result.passed ? (
          <div className="bg-success/20 text-success px-4 py-2 rounded-full font-bold flex items-center gap-2">
            <Trophy className="w-5 h-5" /> Passed
          </div>
        ) : (
          <div className="bg-destructive/20 text-destructive px-4 py-2 rounded-full font-bold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" /> Failed
          </div>
        )}
      </div>

      {/* Score Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-card-border">
          <CardContent className="p-6 flex flex-col items-center text-center justify-center">
            <div className="text-muted-foreground text-sm font-medium mb-2 flex items-center gap-2"><Target className="w-4 h-4"/> Score</div>
            <div className="text-4xl font-bold text-primary">{result.score} <span className="text-xl text-muted-foreground font-normal">/ {result.maxScore}</span></div>
          </CardContent>
        </Card>
        <Card className="bg-card border-card-border">
          <CardContent className="p-6 flex flex-col items-center text-center justify-center">
            <div className="text-muted-foreground text-sm font-medium mb-2">Accuracy</div>
            <div className="text-4xl font-bold text-foreground">{result.accuracy}%</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-card-border">
          <CardContent className="p-6 flex flex-col items-center text-center justify-center">
            <div className="text-muted-foreground text-sm font-medium mb-2 flex items-center gap-2"><Clock className="w-4 h-4"/> Time Taken</div>
            <div className="text-4xl font-bold text-foreground">{Math.floor(result.timeTakenSeconds / 60)}m {result.timeTakenSeconds % 60}s</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-card-border">
          <CardContent className="p-6 flex flex-col items-center text-center justify-center">
            <div className="text-muted-foreground text-sm font-medium mb-2">Percentile</div>
            <div className="text-4xl font-bold text-accent">{result.percentile ? `${result.percentile}` : 'N/A'}</div>
          </CardContent>
        </Card>
      </div>

      {/* Summary Cards + Pie Chart */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="bg-success/10 border border-success/20 p-4 rounded-lg flex items-center gap-4">
            <CheckCircle2 className="w-8 h-8 text-success" />
            <div>
              <div className="text-2xl font-bold text-success">{result.correctAnswers}</div>
              <div className="text-sm text-success/80">Correct</div>
            </div>
          </div>
          <div className="bg-destructive/10 border border-destructive/20 p-4 rounded-lg flex items-center gap-4">
            <XCircle className="w-8 h-8 text-destructive" />
            <div>
              <div className="text-2xl font-bold text-destructive">{result.incorrectAnswers}</div>
              <div className="text-sm text-destructive/80">Incorrect</div>
            </div>
          </div>
          <div className="bg-muted border border-border p-4 rounded-lg flex items-center gap-4">
            <MinusCircle className="w-8 h-8 text-muted-foreground" />
            <div>
              <div className="text-2xl font-bold text-foreground">{result.skippedAnswers}</div>
              <div className="text-sm text-muted-foreground">Skipped</div>
            </div>
          </div>
        </div>

        {pieData.length > 0 && (
          <Card className="bg-card border-card-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Answer Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                    itemStyle={{ color: "hsl(var(--foreground))" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Weak-Topic Drill CTA — shown when a non-drill exam is failed with wrong answers */}
      {canDrill && (
        <Card className="border border-primary/40 bg-gradient-to-r from-primary/10 to-primary/5">
          <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-start gap-4 flex-1">
              <div className="p-2.5 rounded-lg bg-primary/20 shrink-0">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">Drill Your Mistakes</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  You got <span className="text-destructive font-semibold">{result.incorrectAnswers}</span> question{result.incorrectAnswers > 1 ? "s" : ""} wrong.
                  Launch a focused <strong>{Math.min(result.incorrectAnswers, 5)}-question drill</strong> targeting exactly those gaps — no negative marking, 10 minutes.
                </p>
              </div>
            </div>
            <Button
              onClick={handleStartDrill}
              disabled={isDrilling}
              className="shrink-0 gap-2 min-w-[140px]"
            >
              {isDrilling
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Building drill...</>
                : <><Zap className="w-4 h-4" /> Start Drill</>
              }
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="solutions" className="w-full">
        <TabsList className={`grid w-full ${hasVideoContent ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <TabsTrigger value="solutions">Answer Sheet</TabsTrigger>
          <TabsTrigger value="topic-wise">Topic Analysis</TabsTrigger>
          {hasVideoContent && (
            <TabsTrigger value="videos" className="flex items-center gap-2">
              <QrCode className="w-4 h-4" /> Video Solutions
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="solutions" className="space-y-6 mt-6">
          {/* Filter buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground mr-1">Show:</span>
            <button className={filterBtnClass("all")} onClick={() => setAnswerFilter("all")}>
              All ({result.questionWise.length})
            </button>
            <button className={filterBtnClass("incorrect")} onClick={() => setAnswerFilter("incorrect")}>
              Incorrect ({result.incorrectAnswers})
            </button>
            <button className={filterBtnClass("skipped")} onClick={() => setAnswerFilter("skipped")}>
              Skipped ({result.skippedAnswers})
            </button>
          </div>

          {filteredQuestions.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No questions match the selected filter.
            </div>
          )}

          {filteredQuestions.map((q, idx) => {
            const globalIdx = result.questionWise.findIndex(rq => rq.questionId === q.questionId);
            return (
              <Card key={q.questionId} className={`border-l-4 ${q.isCorrect ? 'border-l-success' : q.selectedOption === null ? 'border-l-muted-foreground' : 'border-l-destructive'}`}>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-4 flex-1 min-w-0">
                      <span className="font-bold text-muted-foreground shrink-0">Q{globalIdx + 1}.</span>
                      <div className="flex-1 min-w-0 text-lg font-medium">
                        <MathText text={q.questionText} />
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      {(q as any).videoUrl && (
                        <a
                          href={(q as any).videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:text-primary/80"
                          title="Watch video solution"
                        >
                          <Video className="w-4 h-4" />
                        </a>
                      )}
                      <span className="text-sm font-bold">
                        {q.marksAwarded > 0 ? <span className="text-success">+{q.marksAwarded}</span> : <span className="text-destructive">{q.marksAwarded}</span>}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 bg-muted/30 p-4 rounded-lg">
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Your Answer</div>
                      <div className="font-medium flex items-center gap-2">
                        {q.selectedOption != null ? `Option ${q.selectedOption + 1}` : "Skipped"}
                        {q.isCorrect && <CheckCircle2 className="w-4 h-4 text-success" />}
                        {!q.isCorrect && q.selectedOption != null && <XCircle className="w-4 h-4 text-destructive" />}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Correct Answer</div>
                      <div className="font-medium text-success">Option {q.correctOption + 1}</div>
                    </div>
                  </div>

                  {q.textSolution && (
                    <div className="mt-4 border-t border-border pt-4">
                      <div className="text-sm font-bold mb-2">Solution:</div>
                      <div className="text-muted-foreground">
                        <MathText text={q.textSolution} />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="topic-wise" className="mt-6 space-y-6">
          {barData.length > 0 && (
            <Card className="bg-card border-card-border">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Topic-wise Accuracy</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={barData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} unit="%" />
                    <RechartsTooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                      itemStyle={{ color: "hsl(var(--foreground))" }}
                      formatter={(value: number) => [`${value}%`, "Accuracy"]}
                    />
                    <Bar dataKey="Accuracy" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Topic Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {result.topicWise.map(topic => (
                  <div key={topic.topicId} className="space-y-2">
                    <div className="flex justify-between text-sm font-medium">
                      <span>{topic.topicName}</span>
                      <span className={topic.accuracy > 75 ? "text-success" : topic.accuracy < 40 ? "text-destructive" : "text-warning"}>
                        {topic.accuracy}% ({topic.correctAnswers}/{topic.totalQuestions})
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${topic.accuracy > 75 ? "bg-success" : topic.accuracy < 40 ? "bg-destructive" : "bg-warning"}`}
                        style={{ width: `${topic.accuracy}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {hasVideoContent && (
          <TabsContent value="videos" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {questionsWithVideo.map((q) => {
                const videoUrl = (q as any).videoUrl as string | null;
                const qrCodeSvg = (q as any).qrCodeSvg as string | null;
                const questionIdx = result.questionWise.findIndex(rq => rq.questionId === q.questionId);
                return (
                  <Card key={q.questionId} className={`border-card-border ${q.isCorrect ? 'border-l-4 border-l-success' : q.selectedOption === null ? 'border-l-4 border-l-muted-foreground' : 'border-l-4 border-l-destructive'}`}>
                    <CardContent className="p-6 space-y-4">
                      <div className="flex items-start gap-3">
                        <span className="font-bold text-muted-foreground shrink-0 text-sm">Q{questionIdx + 1}.</span>
                        <div className="text-sm font-medium line-clamp-3">
                          <MathText text={q.questionText} />
                        </div>
                      </div>

                      {qrCodeSvg ? (
                        <div className="flex flex-col items-center gap-3">
                          <div
                            className="w-40 h-40 bg-white p-2 rounded-lg"
                            dangerouslySetInnerHTML={{ __html: qrCodeSvg }}
                          />
                          <p className="text-xs text-muted-foreground text-center">
                            Scan to watch the video solution
                          </p>
                          {videoUrl && (
                            <a
                              href={videoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Open in browser
                            </a>
                          )}
                        </div>
                      ) : videoUrl ? (
                        <a
                          href={videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-4 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors"
                        >
                          <Video className="w-8 h-8 text-primary shrink-0" />
                          <div>
                            <p className="font-medium text-sm">Watch Video Solution</p>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">{videoUrl}</p>
                          </div>
                          <ExternalLink className="w-4 h-4 text-muted-foreground ml-auto shrink-0" />
                        </a>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
