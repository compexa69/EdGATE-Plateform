import { useGetTopic, useCheckGate, useRecordLectureClick } from "@workspace/api-client-react";
import { Link, useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock, PlayCircle, FileText, HelpCircle, Target, CheckCircle, ChevronRight, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function TopicDetail() {
  const params = useParams();
  const topicId = params.topicId!;
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: topic, isLoading } = useGetTopic(topicId, {
    query: { enabled: !!topicId }
  });

  const recordClick = useRecordLectureClick();
  const checkGate = useCheckGate();

  if (isLoading) return <div className="p-8">Loading topic...</div>;
  if (!topic) return <div className="p-8 text-destructive">Topic not found</div>;

  const handleLectureClick = () => {
    recordClick.mutate({ topicId });
    if (topic.telegramChatId && topic.telegramMessageId) {
      window.open(`tg://resolve?domain=${topic.telegramChatId}&post=${topic.telegramMessageId}`, "_blank");
    } else {
      toast({ title: "No lecture link available", variant: "destructive" });
    }
  };

  const handleExamClick = async (examId: string, targetType: "lecture_quiz" | "dpp" | "pyq" | "topic_test") => {
    try {
      const result = await checkGate.mutateAsync({ data: { targetId: examId, targetType } });
      if (result.allowed) {
        setLocation(`/exam/${examId}`);
      } else {
        toast({ title: "Access Denied", description: result.reason || "Complete previous steps first.", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Error checking access", variant: "destructive" });
    }
  };

  const steps = [
    {
      id: "lecture",
      title: "1. Video Lecture",
      description: "Watch the comprehensive concept breakdown.",
      icon: <PlayCircle className="w-6 h-6" />,
      isCompleted: topic.lectureQuizPassed, // Using this as a proxy for lecture watch if we don't have separate state, or maybe just allow it always
      isLocked: false,
      action: (
        <Button onClick={handleLectureClick} className="w-full sm:w-auto">
          Watch Lecture <ExternalLink className="w-4 h-4 ml-2" />
        </Button>
      )
    },
    {
      id: "quiz",
      title: "2. Lecture Quiz",
      description: "Quick check to ensure you grasped the concepts.",
      icon: <HelpCircle className="w-6 h-6" />,
      isCompleted: topic.lectureQuizPassed,
      isLocked: false, // Usually unlocked after lecture
      action: topic.availableExams.filter(e => e.type === "lecture_quiz").map(exam => (
        <Button key={exam.id} onClick={() => handleExamClick(exam.id, "lecture_quiz")} variant={topic.lectureQuizPassed ? "outline" : "default"} className="w-full sm:w-auto">
          {topic.lectureQuizPassed ? "Retake Quiz" : "Start Quiz"}
        </Button>
      ))
    },
    {
      id: "dpp",
      title: "3. Daily Practice Problem (DPP)",
      description: "Apply concepts to standard problems.",
      icon: <FileText className="w-6 h-6" />,
      isCompleted: topic.dppCompleted,
      isLocked: !topic.lectureQuizPassed,
      action: topic.availableExams.filter(e => e.type === "dpp").map(exam => (
        <Button key={exam.id} onClick={() => handleExamClick(exam.id, "dpp")} disabled={!topic.lectureQuizPassed} variant={topic.dppCompleted ? "outline" : "default"} className="w-full sm:w-auto">
          {topic.dppCompleted ? "Review DPP" : "Solve DPP"}
        </Button>
      ))
    },
    {
      id: "pyq",
      title: "4. Previous Year Questions (PYQ)",
      description: "Tackle actual exam questions.",
      icon: <HelpCircle className="w-6 h-6" />,
      isCompleted: topic.pyqCompleted,
      isLocked: !topic.dppCompleted,
      action: topic.availableExams.filter(e => e.type === "pyq").map(exam => (
        <Button key={exam.id} onClick={() => handleExamClick(exam.id, "pyq")} disabled={!topic.dppCompleted} variant={topic.pyqCompleted ? "outline" : "default"} className="w-full sm:w-auto">
          {topic.pyqCompleted ? "Review PYQ" : "Solve PYQ"}
        </Button>
      ))
    },
    {
      id: "test",
      title: "5. Topic Test",
      description: "Final timed assessment for this topic.",
      icon: <Target className="w-6 h-6" />,
      isCompleted: topic.topicTestPassed,
      isLocked: !topic.pyqCompleted,
      action: topic.availableExams.filter(e => e.type === "topic_test").map(exam => (
        <Button key={exam.id} onClick={() => handleExamClick(exam.id, "topic_test")} disabled={!topic.pyqCompleted} variant={topic.topicTestPassed ? "outline" : "default"} className="w-full sm:w-auto">
          {topic.topicTestPassed ? "Review Test" : "Start Test"}
        </Button>
      ))
    }
  ];

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-8 pb-24 md:pb-8">
      <div className="space-y-4">
        <Link href={`/chapters/${topic.chapterId}`} className="text-sm text-primary hover:underline flex items-center gap-1 w-fit">
          <ChevronRight className="w-4 h-4 rotate-180" /> Back to Chapter
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{topic.name}</h1>
          <p className="text-muted-foreground mt-2">{topic.description}</p>
        </div>
      </div>

      <div className="space-y-4">
        {steps.map((step, index) => (
          <Card key={step.id} className={`border-card-border overflow-hidden transition-all ${
            step.isLocked ? "opacity-60 grayscale" : step.isCompleted ? "border-success/30 bg-success/5" : "border-primary/50"
          }`}>
            <CardContent className="p-6 flex flex-col sm:flex-row items-start sm:items-center gap-6">
              <div className={`shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
                step.isLocked ? "bg-muted text-muted-foreground" : 
                step.isCompleted ? "bg-success text-success-foreground" : "bg-primary/20 text-primary"
              }`}>
                {step.isLocked ? <Lock className="w-6 h-6" /> : step.isCompleted ? <CheckCircle className="w-6 h-6" /> : step.icon}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold">{step.title}</h3>
                <p className="text-muted-foreground">{step.description}</p>
              </div>
              <div className="shrink-0 w-full sm:w-auto">
                {step.action}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
