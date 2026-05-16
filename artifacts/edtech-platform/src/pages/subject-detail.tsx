import { useGetSubject, useListChapters } from "@workspace/api-client-react";
import { Link, useParams, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Lock, BookOpen, CheckCircle, ChevronRight, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SubjectDetail() {
  const params = useParams();
  const subjectId = params.subjectId!;
  const [, setLocation] = useLocation();

  const { data: subject, isLoading: subjectLoading } = useGetSubject(subjectId, {
    query: { enabled: !!subjectId }
  });

  const { data: chapters, isLoading: chaptersLoading } = useListChapters({ subjectId }, {
    query: { enabled: !!subjectId }
  });

  if (subjectLoading || chaptersLoading) {
    return <div className="p-8">Loading subject details...</div>;
  }

  if (!subject) return <div className="p-8 text-destructive">Subject not found</div>;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-8 pb-24 md:pb-8">
      {/* Header */}
      <div className="space-y-4">
        <Link href="/subjects" className="text-sm text-primary hover:underline flex items-center gap-1">
          <ChevronRight className="w-4 h-4 rotate-180" /> Back to Subjects
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{subject.name}</h1>
            <p className="text-muted-foreground mt-2 max-w-2xl">{subject.description}</p>
          </div>
          <div className="text-right shrink-0 bg-card p-4 rounded-lg border border-card-border">
            <div className="text-sm text-muted-foreground mb-1">Overall Progress</div>
            <div className="text-3xl font-bold text-primary">{subject.progressPercent}%</div>
          </div>
        </div>
      </div>

      {/* Chapters List */}
      <div className="space-y-6">
        <h2 className="text-xl font-semibold tracking-tight border-b border-border pb-2">Chapters Outline</h2>

        <div className="space-y-4">
          {chapters?.map((chapter, index) => {
            const isLocked = chapter.gateStatus === "locked";
            const isCompleted = chapter.gateStatus === "completed";

            return (
              <Card key={chapter.id} className={`border-card-border transition-colors ${
                isLocked ? "opacity-60 grayscale" : "hover:border-primary/30"
              }`}>
                <div className="flex flex-col md:flex-row md:items-center p-6 gap-6">
                  {/* Status Icon */}
                  <div className="shrink-0 flex items-center justify-center w-12 h-12 rounded-full bg-muted/50 border border-border">
                    {isLocked ? (
                      <Lock className="w-5 h-5 text-muted-foreground" />
                    ) : isCompleted ? (
                      <CheckCircle className="w-6 h-6 text-success" />
                    ) : (
                      <span className="font-bold text-foreground">{index + 1}</span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 space-y-2">
                    <h3 className="text-lg font-semibold">{chapter.name}</h3>
                    {chapter.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{chapter.description}</p>
                    )}

                    <div className="flex items-center gap-4 text-sm mt-2">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <BookOpen className="w-4 h-4" />
                        <span>{chapter.completedTopics}/{chapter.totalTopics} Topics</span>
                      </div>
                      <div className="w-32">
                        <Progress value={chapter.progressPercent} className="h-1.5 bg-muted">
                          <div className="h-full bg-primary" style={{ width: `${chapter.progressPercent}%` }} />
                        </Progress>
                      </div>
                      {chapter.chapterTestUnlocked && (
                        <span className="text-xs text-warning font-medium">Chapter Test Unlocked</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="shrink-0 flex items-center gap-3">
                    <Link href={isLocked ? "#" : `/chapters/${chapter.id}`}>
                      <Button variant={isCompleted ? "outline" : "default"} disabled={isLocked} className="w-full md:w-auto">
                        {isLocked ? "Locked" : isCompleted ? "Review" : "Continue"}
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Subject Test Section */}
      <Card className={`border-card-border bg-card mt-8 ${
        !subject.subjectTestUnlocked
          ? "opacity-60 grayscale"
          : "border-success/50 shadow-[0_0_20px_-5px_rgba(34,197,94,0.2)]"
      }`}>
        <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              subject.subjectTestUnlocked ? "bg-success/20" : "bg-muted"
            }`}>
              {subject.subjectTestUnlocked
                ? <Trophy className="w-6 h-6 text-success" />
                : <Lock className="w-6 h-6 text-muted-foreground" />
              }
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground">Subject Test</h3>
              <p className="text-sm text-muted-foreground">
                {subject.subjectTestUnlocked
                  ? subject.subjectTestExamId
                    ? "All chapters complete. Final subject-level assessment ready."
                    : "Unlocked — no exam assigned yet. Ask your admin to create one."
                  : "Pass the Chapter Test for every chapter in this subject to unlock."}
              </p>
            </div>
          </div>
          <div>
            <Button
              className="border-success text-success hover:bg-success/10"
              variant="outline"
              disabled={!subject.subjectTestUnlocked || !subject.subjectTestExamId}
              onClick={() => {
                if (subject.subjectTestExamId) setLocation(`/exam/${subject.subjectTestExamId}`);
              }}
            >
              {subject.subjectTestUnlocked
                ? subject.subjectTestExamId
                  ? "Start Subject Test"
                  : "No Exam Assigned"
                : "Pass all Chapter Tests to unlock"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
