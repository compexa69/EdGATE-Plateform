import { useGetExam, useStartExam, useSaveAnswer, useSubmitExam, usePauseExam, useResumeExam } from "@workspace/api-client-react";
import { useParams, useLocation } from "wouter";
import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Clock, Pause, Play, AlertTriangle, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function ExamInterface() {
  const params = useParams();
  const examId = params.examId!;
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, { selectedOption: number | null, isMarkedForReview: boolean, timeSpentSeconds: number }>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  const { data: exam, isLoading: examLoading } = useGetExam(examId, { query: { enabled: !!examId } });
  const startExamMutation = useStartExam();
  const saveAnswerMutation = useSaveAnswer();
  const submitExamMutation = useSubmitExam();
  const pauseExamMutation = usePauseExam();
  const resumeExamMutation = useResumeExam();

  useEffect(() => {
    if (exam && timeLeft === null) {
      // Initialize exam
      startExamMutation.mutate({ examId }, {
        onSuccess: (attempt) => {
          setTimeLeft(attempt.remainingSeconds);
          // Pre-fill existing answers if any
          const initialAnswers: any = {};
          exam.questions.forEach(q => {
            const existing = attempt.answers.find(a => a.questionId === q.id);
            initialAnswers[q.id] = {
              selectedOption: existing?.selectedOption ?? null,
              isMarkedForReview: existing?.isMarkedForReview ?? false,
              timeSpentSeconds: existing?.timeSpentSeconds ?? 0
            };
          });
          setAnswers(initialAnswers);
        },
        onError: () => {
          toast({ title: "Failed to start exam", variant: "destructive" });
        }
      });
    }
  }, [exam, examId]);

  useEffect(() => {
    if (timeLeft !== null && timeLeft > 0 && !isPaused) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev && prev <= 1) {
            handleSubmit();
            return 0;
          }
          return prev ? prev - 1 : 0;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timeLeft, isPaused]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // ─── Tab-switch / visibility detection (SRS NFR-SEC-05) ──────────────────
  useEffect(() => {
    if (!exam || isPaused) return;
    let warnCount = 0;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        warnCount++;
        toast({
          title: warnCount >= 3 ? "Warning: Multiple tab switches detected" : "Tab switch detected",
          description: warnCount >= 3
            ? "Repeated tab switching has been logged and may affect your assessment."
            : "Please stay on this tab during your exam.",
          variant: "destructive",
          duration: 4000,
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [exam, isPaused, toast]);
  // ─────────────────────────────────────────────────────────────────────────

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleSaveCurrentAnswer = useCallback(() => {
    if (!exam) return;
    const q = exam.questions[currentQuestionIndex];
    const ans = answers[q.id];
    if (ans) {
      const timeSpent = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const updatedTime = ans.timeSpentSeconds + timeSpent;
      
      setAnswers(prev => ({
        ...prev,
        [q.id]: { ...ans, timeSpentSeconds: updatedTime }
      }));

      saveAnswerMutation.mutate({
        examId,
        data: {
          questionId: q.id,
          selectedOption: ans.selectedOption,
          isMarkedForReview: ans.isMarkedForReview,
          timeSpentSeconds: updatedTime
        }
      });
    }
    startTimeRef.current = Date.now();
  }, [exam, currentQuestionIndex, answers, examId, saveAnswerMutation]);

  const handleNext = () => {
    handleSaveCurrentAnswer();
    if (exam && currentQuestionIndex < exam.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    handleSaveCurrentAnswer();
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const handleJumpToQuestion = (index: number) => {
    handleSaveCurrentAnswer();
    setCurrentQuestionIndex(index);
  };

  const handleOptionSelect = (optionIndex: number) => {
    if (!exam) return;
    const q = exam.questions[currentQuestionIndex];
    setAnswers(prev => ({
      ...prev,
      [q.id]: { ...prev[q.id], selectedOption: optionIndex }
    }));
  };

  const handleClearResponse = () => {
    if (!exam) return;
    const q = exam.questions[currentQuestionIndex];
    setAnswers(prev => ({
      ...prev,
      [q.id]: { ...prev[q.id], selectedOption: null }
    }));
  };

  const handleMarkReview = (checked: boolean) => {
    if (!exam) return;
    const q = exam.questions[currentQuestionIndex];
    setAnswers(prev => ({
      ...prev,
      [q.id]: { ...prev[q.id], isMarkedForReview: checked }
    }));
  };

  const handlePause = () => {
    handleSaveCurrentAnswer();
    pauseExamMutation.mutate({ examId }, {
      onSuccess: () => setIsPaused(true)
    });
  };

  const handleResume = () => {
    resumeExamMutation.mutate({ examId }, {
      onSuccess: () => {
        setIsPaused(false);
        startTimeRef.current = Date.now();
      }
    });
  };

  const handleSubmit = () => {
    handleSaveCurrentAnswer();
    const formattedAnswers = Object.entries(answers).map(([qId, ans]) => ({
      questionId: qId,
      selectedOption: ans.selectedOption,
      isMarkedForReview: ans.isMarkedForReview,
      timeSpentSeconds: ans.timeSpentSeconds
    }));

    submitExamMutation.mutate({ examId, data: { answers: formattedAnswers } }, {
      onSuccess: (result) => {
        setLocation(`/results/${result.id}`);
      },
      onError: () => {
        toast({ title: "Failed to submit exam", variant: "destructive" });
      }
    });
  };

  if (examLoading) return <div className="min-h-screen flex items-center justify-center">Loading exam...</div>;
  if (!exam) return <div className="min-h-screen flex items-center justify-center text-destructive">Exam not found</div>;

  const currentQ = exam.questions[currentQuestionIndex];
  const currentAns = answers[currentQ?.id] || { selectedOption: null, isMarkedForReview: false };

  const isWarningTime = timeLeft !== null && timeLeft < 300;
  const isDangerTime = timeLeft !== null && timeLeft < 60;

  if (isPaused) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
        <div className="text-center max-w-md">
          <Pause className="w-16 h-16 mx-auto mb-6 text-primary" />
          <h2 className="text-3xl font-bold mb-4">Exam Paused</h2>
          <p className="text-muted-foreground mb-8">Your progress and timer have been saved.</p>
          <Button size="lg" onClick={handleResume} className="w-full text-lg h-14">
            <Play className="w-5 h-5 mr-2" /> Resume Exam
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 lg:px-6 shrink-0 z-10 sticky top-0">
        <div className="font-bold text-lg hidden sm:block truncate max-w-sm">{exam.title}</div>
        <div className={`flex items-center gap-2 font-mono text-xl font-bold px-4 py-1.5 rounded-md ${
          isDangerTime ? 'bg-destructive/20 text-destructive' : 
          isWarningTime ? 'bg-warning/20 text-warning' : 'bg-muted text-foreground'
        }`}>
          <Clock className="w-5 h-5" />
          {timeLeft !== null ? formatTime(timeLeft) : "--:--:--"}
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <Button variant="outline" size="sm" onClick={handlePause} className="hidden sm:flex">
            <Pause className="w-4 h-4 mr-2" /> Pause
          </Button>
          <Button onClick={handleSubmit} variant="default" className="bg-success hover:bg-success/90">
            Submit
          </Button>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden relative">
          <div className="flex-1 overflow-y-auto p-4 lg:p-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentQuestionIndex}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="max-w-4xl mx-auto"
              >
                <div className="flex justify-between items-start mb-6">
                  <h2 className="text-xl font-bold text-foreground">Question {currentQuestionIndex + 1} of {exam.questions.length}</h2>
                  <div className="flex gap-4 text-sm font-medium">
                    <span className="text-success">+{currentQ.marks}</span>
                    <span className="text-destructive">-{currentQ.negativeMarking}</span>
                  </div>
                </div>
                
                <div className="prose prose-invert max-w-none mb-8 text-lg">
                  {currentQ.text}
                </div>

                <div className="space-y-3">
                  {currentQ.options.map((option, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleOptionSelect(idx)}
                      className={`w-full text-left p-4 rounded-lg border-2 transition-all flex items-start gap-4 ${
                        currentAns.selectedOption === idx 
                          ? 'border-primary bg-primary/10' 
                          : 'border-border bg-card hover:border-primary/50'
                      }`}
                    >
                      <div className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                        currentAns.selectedOption === idx ? 'border-primary' : 'border-muted-foreground'
                      }`}>
                        {currentAns.selectedOption === idx && <div className="w-3 h-3 bg-primary rounded-full" />}
                      </div>
                      <span className="text-base">{option}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer Actions */}
          <div className="h-20 border-t border-border bg-card px-4 lg:px-8 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 sm:gap-4">
              <Button variant="outline" onClick={handleClearResponse} disabled={currentAns.selectedOption === null}>
                Clear
              </Button>
              <label className="flex items-center gap-2 cursor-pointer ml-2 sm:ml-4">
                <Checkbox 
                  checked={currentAns.isMarkedForReview} 
                  onCheckedChange={(checked) => handleMarkReview(checked as boolean)}
                />
                <span className="text-sm font-medium select-none text-warning flex items-center gap-1">
                  Mark for Review
                </span>
              </label>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <Button variant="secondary" onClick={handlePrev} disabled={currentQuestionIndex === 0}>
                Previous
              </Button>
              <Button onClick={handleNext} disabled={currentQuestionIndex === exam.questions.length - 1} className="min-w-[100px]">
                {currentAns.selectedOption !== null ? "Save & Next" : "Next"}
              </Button>
            </div>
          </div>
        </main>

        {/* Sidebar */}
        <aside className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-border bg-card flex flex-col h-64 lg:h-auto shrink-0">
          <div className="p-4 border-b border-border font-semibold flex justify-between items-center">
            <span>Question Palette</span>
          </div>
          <div className="p-4 overflow-y-auto flex-1">
            <div className="grid grid-cols-5 sm:grid-cols-8 lg:grid-cols-5 gap-2">
              {exam.questions.map((q, idx) => {
                const ans = answers[q.id];
                let stateClass = "bg-muted text-muted-foreground border-transparent"; // Not visited
                
                if (ans) {
                  if (ans.isMarkedForReview && ans.selectedOption !== null) {
                    stateClass = "bg-warning text-warning-foreground border-warning"; // Answered & Marked
                  } else if (ans.isMarkedForReview) {
                    stateClass = "bg-warning/20 text-warning border-warning"; // Marked
                  } else if (ans.selectedOption !== null) {
                    stateClass = "bg-success text-success-foreground border-success"; // Answered
                  } else if (ans.timeSpentSeconds > 0) {
                    stateClass = "bg-destructive/20 text-destructive border-destructive"; // Visited but unanswered
                  }
                }
                
                const isCurrent = currentQuestionIndex === idx;

                return (
                  <button
                    key={q.id}
                    onClick={() => handleJumpToQuestion(idx)}
                    className={`aspect-square rounded-md border flex items-center justify-center text-sm font-medium transition-all ${stateClass} ${
                      isCurrent ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="p-4 border-t border-border space-y-2 text-xs bg-muted/30">
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-success rounded-sm" /> Answered</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-destructive/20 border border-destructive rounded-sm" /> Not Answered</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-warning/20 border border-warning rounded-sm" /> Marked for Review</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-warning rounded-sm" /> Answered & Marked</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-muted rounded-sm" /> Not Visited</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
