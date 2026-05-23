import { useListSubjects } from "@/hooks/use-subjects";
import { useListExams } from "@/hooks/use-exams";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Lock, BookOpen, CheckCircle, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function Subjects() {
  const { data: subjects, isLoading } = useListSubjects();
  const { data: grandTests } = useListExams({ type: "grand_test" });
  const [, setLocation] = useLocation();

  if (isLoading) {
    return <div className="p-8">Loading subjects...</div>;
  }

  const grandTest = grandTests?.[0];
  const grandTestUnlocked = grandTest?.isUnlocked ?? false;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6 pb-24 md:pb-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Your Subjects</h1>
        <p className="text-muted-foreground mt-1">Mastery requires deep focus. Select a subject to begin.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {subjects?.map((subject) => {
          const isLocked = subject.gateStatus === "locked";
          const isCompleted = subject.gateStatus === "completed";

          return (
            <Link key={subject.id} href={isLocked ? "#" : `/subjects/${subject.id}`}>
              <Card className={`h-full transition-all duration-200 border-card-border ${
                isLocked 
                  ? "opacity-60 grayscale cursor-not-allowed" 
                  : "hover:border-primary/50 hover:shadow-md cursor-pointer hover:-translate-y-1"
              }`}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-xl flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-primary" />
                      {subject.name}
                    </CardTitle>
                    {isLocked && <Lock className="w-5 h-5 text-muted-foreground" />}
                    {isCompleted && <CheckCircle className="w-5 h-5 text-success" />}
                  </div>
                  {subject.description && (
                    <CardDescription className="line-clamp-2 mt-2">
                      {subject.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">{subject.progressPercent}%</span>
                  </div>
                  <Progress value={subject.progressPercent} className="h-2 bg-muted">
                    <div 
                      className="h-full bg-primary transition-all duration-500 ease-in-out" 
                      style={{ width: `${subject.progressPercent}%` }} 
                    />
                  </Progress>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-xs">
                      {subject.completedChapters}/{subject.totalChapters} Chapters
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Grand Test Entry Point (SRS H-05) */}
      <Card className={`border-card-border mt-4 ${
        grandTestUnlocked
          ? "border-warning/50 shadow-[0_0_24px_-6px_rgba(234,179,8,0.25)]"
          : "opacity-60 grayscale"
      }`}>
        <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center ${
              grandTestUnlocked ? "bg-warning/20" : "bg-muted"
            }`}>
              {grandTestUnlocked
                ? <Trophy className="w-7 h-7 text-warning" />
                : <Lock className="w-7 h-7 text-muted-foreground" />
              }
            </div>
            <div>
              <h3 className="text-2xl font-bold">Grand Test</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                {grandTestUnlocked
                  ? grandTest?.id
                    ? "All subject tests passed. The ultimate challenge awaits."
                    : "Unlocked — no grand test assigned yet. Ask your admin to create one."
                  : "Pass every Subject Test across all subjects to unlock the Grand Test."}
              </p>
            </div>
          </div>
          <Button
            size="lg"
            className="border-warning text-warning hover:bg-warning/10 shrink-0"
            variant="outline"
            disabled={!grandTestUnlocked || !grandTest?.id}
            onClick={() => {
              if (grandTest?.id) setLocation(`/exam/${grandTest.id}`);
            }}
          >
            {grandTestUnlocked
              ? grandTest?.id ? "Start Grand Test" : "No Exam Assigned"
              : "Pass all Subject Tests to unlock"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
