import { useGetChapter, useListTopics } from "@workspace/api-client-react";
import { Link, useParams, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Lock, CheckCircle, ChevronRight, PlayCircle, FileText, HelpCircle, FileCheck, Target, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function ChapterDetail() {
  const params = useParams();
  const chapterId = params.chapterId!;
  const [, setLocation] = useLocation();

  const { data: chapter, isLoading: chapterLoading } = useGetChapter(chapterId, {
    query: { enabled: !!chapterId, queryKey: ["chapter", chapterId] } as any
  });

  const { data: topics, isLoading: topicsLoading } = useListTopics(chapterId, {
    query: { enabled: !!chapterId, queryKey: ["topics", chapterId] } as any
  });

  if (chapterLoading || topicsLoading) {
    return <div className="p-8">Loading chapter...</div>;
  }

  if (!chapter) return <div className="p-8 text-destructive">Chapter not found</div>;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-8 pb-24 md:pb-8">
      {/* Header */}
      <div className="space-y-4">
        <Link href={`/subjects/${chapter.subjectId}`} className="text-sm text-primary hover:underline flex items-center gap-1 w-fit">
          <ChevronRight className="w-4 h-4 rotate-180" /> Back to Subject
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{chapter.name}</h1>
          <p className="text-muted-foreground mt-2">{chapter.description}</p>
        </div>
      </div>

      <div className="space-y-6">
        <h2 className="text-xl font-semibold tracking-tight border-b border-border pb-2">Topic Progression</h2>
        
        <div className="space-y-4">
          {topics?.map((topic, index) => {
            const isLocked = topic.gateStatus === "locked";
            const isCompleted = topic.gateStatus === "completed";
            
            // Calculate step progress visually
            let stepsComplete = 0;
            if (topic.lectureQuizPassed) stepsComplete++;
            if (topic.dppCompleted) stepsComplete++;
            if (topic.pyqCompleted) stepsComplete++;
            if (topic.topicTestPassed) stepsComplete++;
            const stepProgress = (stepsComplete / 4) * 100;

            return (
              <Card key={topic.id} className={`border-card-border overflow-hidden transition-all ${
                isLocked ? "opacity-60 grayscale" : isCompleted ? "border-success/30" : "border-primary/50 shadow-[0_0_15px_-5px_rgba(99,102,241,0.2)]"
              }`}>
                <div className="p-5 flex flex-col md:flex-row gap-5 items-start md:items-center">
                  
                  {/* Number / Status */}
                  <div className="shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-muted border border-border font-bold">
                    {isLocked ? <Lock className="w-4 h-4 text-muted-foreground" /> : isCompleted ? <CheckCircle className="w-5 h-5 text-success" /> : index + 1}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold truncate">{topic.name}</h3>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
                      <span className={`px-2 py-1 rounded flex items-center gap-1 ${topic.lectureQuizPassed ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}`}>
                        <PlayCircle className="w-3 h-3" /> Lecture
                      </span>
                      <span className={`px-2 py-1 rounded flex items-center gap-1 ${topic.dppCompleted ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}`}>
                        <FileText className="w-3 h-3" /> DPP
                      </span>
                      <span className={`px-2 py-1 rounded flex items-center gap-1 ${topic.pyqCompleted ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}`}>
                        <HelpCircle className="w-3 h-3" /> PYQ
                      </span>
                      <span className={`px-2 py-1 rounded flex items-center gap-1 ${topic.topicTestPassed ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}`}>
                        <Target className="w-3 h-3" /> Test
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="shrink-0 w-full md:w-auto">
                    <Link href={isLocked ? "#" : `/topics/${topic.id}`}>
                      <Button className="w-full" variant={isCompleted ? "outline" : "default"} disabled={isLocked}>
                        {isLocked ? "Locked" : isCompleted ? "Review Topic" : "Enter Topic"}
                      </Button>
                    </Link>
                  </div>
                </div>
                
                {/* Progress bar bottom border */}
                {!isLocked && (
                  <Progress value={stepProgress} className="h-1 rounded-none bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${stepProgress}%` }} />
                  </Progress>
                )}
              </Card>
            );
          })}
        </div>
      </div>
      
      {/* Notes Vault Section */}
      <Card className={`border-card-border bg-card ${!chapter.notesUploadUnlocked ? 'opacity-60 grayscale' : 'border-primary/50 shadow-[0_0_20px_-5px_rgba(99,102,241,0.15)]'}`}>
        <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${chapter.notesUploadUnlocked ? 'bg-primary/20' : 'bg-muted'}`}>
              {chapter.notesUploadUnlocked
                ? <FolderOpen className="w-6 h-6 text-primary" />
                : <Lock className="w-6 h-6 text-muted-foreground" />
              }
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground">Notes Vault</h3>
              <p className="text-sm text-muted-foreground">
                {chapter.notesUploadUnlocked
                  ? "Chapter test attempted. Your vault is open — upload your handwritten or typed notes."
                  : "Attempt the Chapter Test to unlock your personal Notes Vault for this chapter."}
              </p>
            </div>
          </div>
          <div>
            <Badge variant={chapter.notesUploadUnlocked ? "default" : "secondary"} className="text-sm px-3 py-1">
              {chapter.notesUploadUnlocked ? "Vault Unlocked" : "Locked"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Chapter Test Section */}
      <Card className={`border-card-border bg-card ${!chapter.chapterTestUnlocked ? 'opacity-60 grayscale' : 'border-warning/50'}`}>
        <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-warning/20 flex items-center justify-center">
              <FileCheck className="w-6 h-6 text-warning" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground">Chapter Test</h3>
              <p className="text-sm text-muted-foreground">
                {chapter.chapterTestUnlocked
                  ? chapter.chapterTestExamId
                    ? "Comprehensive test covering all topics. Ready to attempt."
                    : "Test unlocked — no exam assigned yet. Ask your admin to create one."
                  : "Complete all topics to unlock the chapter test."}
              </p>
            </div>
          </div>
          <div>
            <Button
              variant="outline"
              className="border-warning text-warning hover:bg-warning/10"
              disabled={!chapter.chapterTestUnlocked || !chapter.chapterTestExamId}
              onClick={() => {
                if (chapter.chapterTestExamId) setLocation(`/exam/${chapter.chapterTestExamId}`);
              }}
            >
              {chapter.chapterTestUnlocked
                ? chapter.chapterTestExamId
                  ? "Start Chapter Test"
                  : "No Exam Assigned"
                : "Complete all topics to unlock"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
