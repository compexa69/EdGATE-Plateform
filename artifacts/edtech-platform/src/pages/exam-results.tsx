import { useGetResult } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ChevronRight, CheckCircle2, XCircle, MinusCircle, Trophy, Target, Clock, AlertTriangle } from "lucide-react";

export default function ExamResults() {
  const params = useParams();
  const resultId = params.resultId!;

  const { data: result, isLoading } = useGetResult(resultId, {
    query: { enabled: !!resultId }
  });

  if (isLoading) return <div className="p-8">Loading results...</div>;
  if (!result) return <div className="p-8 text-destructive">Result not found</div>;

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

      {/* Breakdown */}
      <div className="grid grid-cols-3 gap-4">
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

      <Tabs defaultValue="solutions" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="solutions">Detailed Solutions</TabsTrigger>
          <TabsTrigger value="topic-wise">Topic Analysis</TabsTrigger>
        </TabsList>
        
        <TabsContent value="solutions" className="space-y-6 mt-6">
          {result.questionWise.map((q, idx) => (
            <Card key={q.questionId} className={`border-l-4 ${q.isCorrect ? 'border-l-success' : q.selectedOption === null ? 'border-l-muted-foreground' : 'border-l-destructive'}`}>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-4">
                    <span className="font-bold text-muted-foreground shrink-0">Q{idx + 1}.</span>
                    <p className="font-medium text-lg">{q.questionText}</p>
                  </div>
                  <div className="shrink-0 text-sm font-bold">
                    {q.marksAwarded > 0 ? <span className="text-success">+{q.marksAwarded}</span> : <span className="text-destructive">{q.marksAwarded}</span>}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 bg-muted/30 p-4 rounded-lg">
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Your Answer</div>
                    <div className="font-medium flex items-center gap-2">
                      {q.selectedOption !== null ? `Option ${q.selectedOption + 1}` : "Skipped"}
                      {q.isCorrect && <CheckCircle2 className="w-4 h-4 text-success" />}
                      {!q.isCorrect && q.selectedOption !== null && <XCircle className="w-4 h-4 text-destructive" />}
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
                    <p className="text-muted-foreground whitespace-pre-wrap">{q.textSolution}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="topic-wise" className="mt-6">
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
      </Tabs>
    </div>
  );
}
