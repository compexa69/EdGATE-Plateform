import { useGetTopic, useCheckGate, useRecordLectureClick, useGetChapter, useGetUploadUrl, useConfirmUpload, useGetInlineNote, useSaveInlineNote } from "@workspace/api-client-react";
import { Link, useParams, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock, PlayCircle, FileText, HelpCircle, Target, CheckCircle, ChevronRight, ExternalLink, Upload, FolderOpen, PenLine, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRef, useState, useEffect } from "react";

export default function TopicDetail() {
  const params = useParams();
  const topicId = params.topicId!;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [noteUploaded, setNoteUploaded] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [isPreview, setIsPreview] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  const { data: topic, isLoading: topicLoading } = useGetTopic(topicId, {
    query: { enabled: !!topicId, queryKey: ["topic", topicId] }
  });

  const { data: chapter } = useGetChapter(topic?.chapterId ?? "", {
    query: { enabled: !!topic?.chapterId, queryKey: ["chapter", topic?.chapterId ?? ""] }
  });

  const getUploadUrl = useGetUploadUrl();
  const confirmUpload = useConfirmUpload();
  const { data: existingNote } = useGetInlineNote(topicId, {
    query: { enabled: !!topicId, queryKey: ["inline-note", topicId] }
  });
  const saveNote = useSaveInlineNote();

  useEffect(() => {
    if (existingNote?.content !== undefined) {
      setNoteContent(existingNote.content);
    }
  }, [existingNote]);
  const recordClick = useRecordLectureClick();
  const checkGate = useCheckGate();

  const handleSaveNote = async () => {
    setSaveStatus("saving");
    try {
      await saveNote.mutateAsync({ topicId, data: { content: noteContent } });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      toast({ title: "Failed to save note", variant: "destructive" });
      setSaveStatus("idle");
    }
  };

  if (topicLoading) return <div className="p-8">Loading topic...</div>;
  if (!topic) return <div className="p-8 text-destructive">Topic not found</div>;

  const notesUnlocked = !!chapter?.chapterTestUnlocked && topic.topicTestPassed;

  const telegramUrl = (topic as any).telegramUrl as string | null;
  const youtubeUrl = (topic as any).youtubeUrl as string | null;

  const handleLectureClick = (platform?: "telegram" | "youtube") => {
    recordClick.mutate({ topicId });
    if (platform === "youtube" && youtubeUrl) {
      window.open(youtubeUrl, "_blank");
    } else if (telegramUrl) {
      window.open(telegramUrl, "_blank");
    } else if (topic.telegramChatId && topic.telegramMessageId) {
      window.open(`tg://resolve?domain=${topic.telegramChatId}&post=${topic.telegramMessageId}`, "_blank");
    } else if (youtubeUrl) {
      window.open(youtubeUrl, "_blank");
    } else {
      toast({ title: "No lecture link configured", description: "Ask your admin to add a lecture link for this topic.", variant: "destructive" });
    }
  };

  const hasLecture = !!(telegramUrl || (topic.telegramChatId && topic.telegramMessageId) || youtubeUrl);

  const handleExamClick = async (examId: string, targetType: "lecture_quiz" | "dpp" | "pyq" | "topic_test") => {
    try {
      const result = await checkGate.mutateAsync({ data: { targetId: examId, targetType } });
      if (result.allowed) {
        setLocation(`/exam/${examId}`);
      } else {
        toast({ title: "Access Denied", description: result.reason || "Complete previous steps first.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error checking access", variant: "destructive" });
    }
  };

  const handleNotesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "File too large", description: "Notes PDF must be under 20MB.", variant: "destructive" });
      return;
    }

    if (file.type !== "application/pdf") {
      toast({ title: "Invalid file type", description: "Only PDF files are accepted.", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const { uploadUrl, b2Key } = await getUploadUrl.mutateAsync({
        data: { fileName: file.name, fileSizeBytes: file.size, chapterId: topic.chapterId }
      });

      await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": "application/pdf" }
      });

      await confirmUpload.mutateAsync({
        data: { b2Key, fileName: file.name, fileSizeBytes: file.size, chapterId: topic.chapterId }
      });

      setNoteUploaded(true);
      toast({ title: "Notes uploaded!", description: "Your PDF has been saved to your vault." });
    } catch {
      toast({ title: "Upload failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const steps = [
    {
      id: "lecture",
      title: "1. Video Lecture",
      description: hasLecture
        ? "Watch the comprehensive concept breakdown."
        : "No lecture link configured yet — ask your admin to add one.",
      icon: <PlayCircle className="w-6 h-6" />,
      isCompleted: topic.lectureQuizPassed,
      isLocked: false,
      action: hasLecture ? (
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {(telegramUrl || (topic.telegramChatId && topic.telegramMessageId)) && (
            <Button onClick={() => handleLectureClick("telegram")} className="w-full sm:w-auto gap-2">
              <PlayCircle className="w-4 h-4" /> Telegram
            </Button>
          )}
          {youtubeUrl && (
            <Button onClick={() => handleLectureClick("youtube")} variant="outline" className="w-full sm:w-auto gap-2 border-red-500/40 text-red-400 hover:bg-red-500/10">
              <ExternalLink className="w-4 h-4" /> YouTube
            </Button>
          )}
        </div>
      ) : (
        <Button variant="outline" disabled className="w-full sm:w-auto opacity-50">
          No link yet
        </Button>
      ),
    },
    {
      id: "quiz",
      title: "2. Lecture Quiz",
      description: "Quick check to ensure you grasped the concepts.",
      icon: <HelpCircle className="w-6 h-6" />,
      isCompleted: topic.lectureQuizPassed,
      isLocked: false,
      action: (
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {topic.availableExams.filter(e => e.type === "lecture_quiz").map(exam => (
            <Button key={exam.id} onClick={() => handleExamClick(exam.id, "lecture_quiz")} variant={topic.lectureQuizPassed ? "outline" : "default"} className="w-full sm:w-auto">
              {topic.lectureQuizPassed ? "Retake Quiz" : "Start Quiz"}
            </Button>
          ))}
        </div>
      )
    },
    {
      id: "dpp",
      title: "3. Daily Practice Problem (DPP)",
      description: "Apply concepts to standard problems.",
      icon: <FileText className="w-6 h-6" />,
      isCompleted: topic.dppCompleted,
      isLocked: !topic.lectureQuizPassed,
      action: (
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {topic.availableExams.filter(e => e.type === "dpp").map(exam => (
            <Button key={exam.id} onClick={() => handleExamClick(exam.id, "dpp")} disabled={!topic.lectureQuizPassed} variant={topic.dppCompleted ? "outline" : "default"} className="w-full sm:w-auto">
              {topic.dppCompleted ? "Review DPP" : "Solve DPP"}
            </Button>
          ))}
        </div>
      )
    },
    {
      id: "pyq",
      title: "4. Previous Year Questions (PYQ)",
      description: "Tackle actual exam questions from past papers.",
      icon: <HelpCircle className="w-6 h-6" />,
      isCompleted: topic.pyqCompleted,
      isLocked: !topic.dppCompleted,
      action: (
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {topic.availableExams.filter(e => e.type === "pyq").map(exam => (
            <Button key={exam.id} onClick={() => handleExamClick(exam.id, "pyq")} disabled={!topic.dppCompleted} variant={topic.pyqCompleted ? "outline" : "default"} className="w-full sm:w-auto">
              {topic.pyqCompleted ? "Review PYQ" : "Solve PYQ"}
            </Button>
          ))}
        </div>
      )
    },
    {
      id: "test",
      title: "5. Topic Test",
      description: "Final timed assessment for this topic.",
      icon: <Target className="w-6 h-6" />,
      isCompleted: topic.topicTestPassed,
      isLocked: !topic.pyqCompleted,
      action: (
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {topic.availableExams.filter(e => e.type === "topic_test").map(exam => (
            <Button key={exam.id} onClick={() => handleExamClick(exam.id, "topic_test")} disabled={!topic.pyqCompleted} variant={topic.topicTestPassed ? "outline" : "default"} className="w-full sm:w-auto">
              {topic.topicTestPassed ? "Review Test" : "Start Test"}
            </Button>
          ))}
        </div>
      )
    },
    {
      id: "notes",
      title: "6. Upload Notes (PDF)",
      description: notesUnlocked
        ? "Upload your handwritten or typed notes for this topic."
        : "Complete all topics in this chapter and attempt the Chapter Test to unlock.",
      icon: <FolderOpen className="w-6 h-6" />,
      isCompleted: noteUploaded,
      isLocked: !notesUnlocked,
      action: notesUnlocked ? (
        <div className="w-full sm:w-auto">
          {noteUploaded ? (
            <div className="flex items-center gap-2 text-success text-sm font-medium">
              <CheckCircle className="w-5 h-5" /> Uploaded! <Link href="/notes" className="text-primary hover:underline ml-1">View vault</Link>
            </div>
          ) : (
            <>
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                className="w-full sm:w-auto border-primary text-primary hover:bg-primary/10"
                disabled={isUploading}
              >
                <Upload className="w-4 h-4 mr-2" />
                {isUploading ? "Uploading…" : "Upload PDF"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleNotesUpload}
              />
            </>
          )}
        </div>
      ) : undefined,
    }
  ];

  function renderMarkdown(text: string) {
    if (!text.trim()) return "<p class='text-muted-foreground text-sm'>Nothing to preview. Switch to Edit and start writing.</p>";
    const escaped = text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    return escaped
      .replace(/^### (.+)$/gm,"<h3 style='font-size:1rem;font-weight:600;margin:0.75rem 0 0.25rem'>$1</h3>")
      .replace(/^## (.+)$/gm,"<h2 style='font-size:1.1rem;font-weight:700;margin:1rem 0 0.25rem'>$1</h2>")
      .replace(/^# (.+)$/gm,"<h1 style='font-size:1.25rem;font-weight:700;margin:1rem 0 0.5rem'>$1</h1>")
      .replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")
      .replace(/\*(.+?)\*/g,"<em>$1</em>")
      .replace(/`(.+?)`/g,"<code style='background:rgba(99,102,241,0.12);padding:0.1rem 0.35rem;border-radius:3px;font-size:0.8rem;font-family:monospace'>$1</code>")
      .replace(/^- (.+)$/gm,"<li style='margin-left:1.25rem;list-style:disc'>$1</li>")
      .replace(/\n\n/g,"</p><p style='margin-bottom:0.5rem'>")
      .replace(/\n/g,"<br/>")
      .replace(/^/,"<p style='margin-bottom:0.5rem'>")
      .replace(/$/,"</p>");
  }

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
        {steps.map((step) => (
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
              {step.action && (
                <div className="shrink-0 w-full sm:w-auto">
                  {step.action}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-card-border bg-card">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <PenLine className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-lg">My Notes</h3>
              <span className="text-xs text-muted-foreground hidden sm:inline">— Markdown supported</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={isPreview ? "outline" : "secondary"}
                size="sm"
                onClick={() => setIsPreview(false)}
                className="gap-1.5"
              >
                <PenLine className="w-3.5 h-3.5" /> Edit
              </Button>
              <Button
                variant={isPreview ? "secondary" : "outline"}
                size="sm"
                onClick={() => setIsPreview(true)}
                className="gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" /> Preview
              </Button>
            </div>
          </div>

          {isPreview ? (
            <div
              className="min-h-[200px] p-4 rounded-lg bg-background border border-border text-sm leading-relaxed text-foreground overflow-auto"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(noteContent) }}
            />
          ) : (
            <textarea
              className="w-full min-h-[200px] p-4 rounded-lg bg-background border border-border text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring text-foreground placeholder:text-muted-foreground leading-relaxed"
              placeholder={"Write your notes here…\n\nMarkdown tips:\n# Heading   **bold**   *italic*   `code`\n- list item"}
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              onBlur={handleSaveNote}
            />
          )}

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "✓ Saved" : "Auto-saves on blur"}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSaveNote}
              disabled={saveStatus === "saving"}
            >
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
