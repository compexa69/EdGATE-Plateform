import { useListQuestions, useCreateQuestion, useDeleteQuestion, useUpdateQuestion } from "@workspace/api-client-react";
import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash, Upload, Download, CheckCircle2, XCircle, FileSpreadsheet, Loader2, AlertTriangle, Youtube, VideoOff, Search, X, FileText, Save } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const TEMPLATE_CSV = `text,option1,option2,option3,option4,correct_option,marks,difficulty,topic_id,text_solution
"What is the SI unit of force?",Newton,Joule,Watt,Pascal,0,4,easy,,Force = mass × acceleration; SI unit is Newton (N).
"Which particle has no charge?",Proton,Electron,Neutron,Positron,2,4,medium,,Neutrons are electrically neutral particles found in the nucleus.
"The value of Avogadro's number is approximately:",6.022×10²³,6.022×10²¹,6.022×10²⁵,6.022×10¹⁹,0,4,hard,,Avogadro's number NA ≈ 6.022 × 10²³ mol⁻¹.`;

type ParsedRow = {
  rowNum: number;
  text: string;
  option1: string;
  option2: string;
  option3: string;
  option4: string;
  correct_option: string;
  marks: string;
  difficulty: string;
  topic_id: string;
  text_solution: string;
  errors: string[];
};

type ImportResultRow = {
  row: number;
  status: "imported" | "failed";
  question?: string;
  error?: string;
};

type ImportResult = {
  imported: number;
  failed: number;
  total: number;
  rows: ImportResultRow[];
};

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => { raw[h] = values[idx] ?? ""; });

    const errors: string[] = [];
    if (!raw["text"]?.trim()) errors.push("Question text is required");
    if (!raw["option1"]?.trim() || !raw["option2"]?.trim() || !raw["option3"]?.trim() || !raw["option4"]?.trim())
      errors.push("All 4 options required");
    const co = parseInt(raw["correct_option"] ?? "", 10);
    if (isNaN(co) || co < 0 || co > 3) errors.push("correct_option must be 0–3");
    if (raw["marks"] && (isNaN(parseFloat(raw["marks"])) || parseFloat(raw["marks"]) <= 0))
      errors.push("marks must be a positive number");
    const diff = raw["difficulty"]?.toLowerCase();
    if (diff && !["easy", "medium", "hard"].includes(diff)) errors.push("difficulty must be easy, medium, or hard");

    rows.push({
      rowNum: i + 1,
      text: raw["text"] ?? "",
      option1: raw["option1"] ?? "",
      option2: raw["option2"] ?? "",
      option3: raw["option3"] ?? "",
      option4: raw["option4"] ?? "",
      correct_option: raw["correct_option"] ?? "",
      marks: raw["marks"] ?? "4",
      difficulty: raw["difficulty"] ?? "medium",
      topic_id: raw["topic_id"] ?? "",
      text_solution: raw["text_solution"] ?? "",
      errors,
    });
  }
  return rows;
}

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "questions_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

type Question = {
  id: string;
  text: string;
  difficulty: string;
  marks: number;
  topicId: string | null;
  textSolution: string | null;
  videoUrl: string | null;
  qrCodeSvg: string | null;
};

function isYouTubeUrl(url: string): boolean {
  return /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{11}/.test(url.trim());
}

export default function AdminQuestions() {
  const { data: questions, isLoading, refetch } = useListQuestions();
  const createQuestion = useCreateQuestion();
  const deleteQuestion = useDeleteQuestion();
  const updateQuestion = useUpdateQuestion();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Video / solution modal state
  const [videoModal, setVideoModal] = useState<{ open: boolean; question: Question | null }>({ open: false, question: null });
  const [videoUrlInput, setVideoUrlInput] = useState("");
  const [textSolutionInput, setTextSolutionInput] = useState("");
  const [videoFilter, setVideoFilter] = useState<"all" | "with" | "without">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [newQ, setNewQ] = useState({
    text: "",
    option1: "", option2: "", option3: "", option4: "",
    correctOption: "0",
    marks: "4",
    difficulty: "medium" as "easy" | "medium" | "hard"
  });

  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setParsedRows(parseCSV(text));
    };
    reader.readAsText(file);
  }, []);

  const handleImport = async () => {
    if (!importFile) return;
    setIsImporting(true);
    try {
      const token = localStorage.getItem("edtech_token");
      const formData = new FormData();
      formData.append("file", importFile);
      const res = await fetch("/api/questions/import", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        toast({ title: "Import failed", description: err.error, variant: "destructive" });
        return;
      }
      const result: ImportResult = await res.json();
      setImportResult(result);
      if (result.imported > 0) {
        refetch();
        toast({ title: `Imported ${result.imported} question${result.imported !== 1 ? "s" : ""}`, description: result.failed > 0 ? `${result.failed} rows had errors.` : "All rows imported successfully." });
      } else {
        toast({ title: "No questions imported", description: "All rows had validation errors.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", description: "Could not reach the server.", variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  const resetImport = () => {
    setImportFile(null);
    setParsedRows([]);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const validRows = parsedRows.filter(r => r.errors.length === 0);
  const invalidRows = parsedRows.filter(r => r.errors.length > 0);

  if (isLoading) return <div className="p-8">Loading...</div>;

  const handleCreate = () => {
    createQuestion.mutate({
      data: {
        text: newQ.text,
        options: [newQ.option1, newQ.option2, newQ.option3, newQ.option4],
        correctOption: parseInt(newQ.correctOption),
        marks: parseInt(newQ.marks),
        difficulty: newQ.difficulty
      }
    }, {
      onSuccess: () => {
        toast({ title: "Question added" });
        setIsCreateOpen(false);
        setNewQ({ text: "", option1: "", option2: "", option3: "", option4: "", correctOption: "0", marks: "4", difficulty: "medium" });
        refetch();
      }
    });
  };

  const handleDelete = (id: string) => {
    deleteQuestion.mutate({ questionId: id }, {
      onSuccess: () => { toast({ title: "Question deleted" }); refetch(); }
    });
  };

  const openVideoModal = (q: Question) => {
    setVideoModal({ open: true, question: q });
    setVideoUrlInput(q.videoUrl ?? "");
    setTextSolutionInput(q.textSolution ?? "");
  };

  const handleVideoSave = () => {
    if (!videoModal.question) return;
    const url = videoUrlInput.trim();
    const sol = textSolutionInput.trim();
    updateQuestion.mutate(
      {
        questionId: videoModal.question.id,
        data: {
          ...(url ? { videoUrl: url } : {}),
          ...(sol !== (videoModal.question.textSolution ?? "") ? { textSolution: sol || undefined } : {}),
        },
      },
      {
        onSuccess: () => {
          const parts: string[] = [];
          if (url) parts.push("video URL saved");
          if (sol) parts.push("solution saved");
          toast({
            title: parts.length ? parts.map(p => p[0].toUpperCase() + p.slice(1)).join(" & ") : "Changes saved",
            description: url ? "QR code generated automatically." : undefined,
          });
          setVideoModal({ open: false, question: null });
          refetch();
        },
        onError: () => toast({ title: "Failed to save", variant: "destructive" }),
      }
    );
  };

  const handleVideoClear = () => {
    if (!videoModal.question) return;
    updateQuestion.mutate(
      { questionId: videoModal.question.id, data: { videoUrl: undefined } },
      {
        onSuccess: () => {
          toast({ title: "Video URL removed" });
          setVideoModal({ open: false, question: null });
          refetch();
        },
        onError: () => toast({ title: "Failed to remove", variant: "destructive" }),
      }
    );
  };

  const difficultyBadgeClass = (d: string) =>
    d === "easy" ? "bg-success/10 text-success border-success/20" :
    d === "hard" ? "bg-destructive/10 text-destructive border-destructive/20" :
    "bg-warning/10 text-warning border-warning/20";

  const filteredQuestions = (questions as Question[] | undefined)?.filter(q => {
    const matchesSearch = !searchQuery || q.text.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter =
      videoFilter === "all" ? true :
      videoFilter === "with" ? !!q.videoUrl :
      !q.videoUrl;
    return matchesSearch && matchesFilter;
  }) ?? [];

  const withVideoCount = (questions as Question[] | undefined)?.filter(q => !!q.videoUrl).length ?? 0;
  const withoutVideoCount = (questions?.length ?? 0) - withVideoCount;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6 pb-24 md:pb-8">
      {/* Solution & Video Modal */}
      <Dialog open={videoModal.open} onOpenChange={(open) => { if (!open) setVideoModal({ open: false, question: null }); }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" /> Edit Solution
            </DialogTitle>
          </DialogHeader>
          {videoModal.question && (
            <div className="space-y-5 pt-2">
              {/* Question preview */}
              <p className="text-sm text-muted-foreground line-clamp-3 bg-muted/40 rounded-lg px-3 py-2 border border-border">
                {videoModal.question.text}
              </p>

              {/* Text Solution section */}
              <div className="space-y-2">
                <Label htmlFor="textSolutionInput" className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-primary" /> Step-by-step Solution
                </Label>
                <textarea
                  id="textSolutionInput"
                  rows={7}
                  className="w-full p-3 rounded-md bg-background border border-input text-foreground text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground font-mono leading-relaxed"
                  placeholder={"Step 1: Write the given data…\nStep 2: Apply the formula…\nStep 3: Solve and simplify…\n∴ Answer = Option B"}
                  value={textSolutionInput}
                  onChange={e => setTextSolutionInput(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Plain text. Use line breaks to separate steps. Shown to students after they attempt the question.</p>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Video Solution</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* YouTube URL section */}
              <div className="space-y-2">
                <Label htmlFor="videoUrlInput" className="flex items-center gap-1.5">
                  <Youtube className="w-3.5 h-3.5 text-red-500" /> YouTube Video URL
                </Label>
                <Input
                  id="videoUrlInput"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={videoUrlInput}
                  onChange={e => setVideoUrlInput(e.target.value)}
                  className={videoUrlInput && !isYouTubeUrl(videoUrlInput) ? "border-destructive" : ""}
                />
                {videoUrlInput && !isYouTubeUrl(videoUrlInput) && (
                  <p className="text-xs text-destructive">Must be a valid YouTube URL (youtube.com/watch?v= or youtu.be/)</p>
                )}
                {videoUrlInput && isYouTubeUrl(videoUrlInput) && (
                  <p className="flex items-center gap-1.5 text-xs text-success">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Valid — QR code will be generated on save.
                  </p>
                )}
              </div>

              {/* Existing QR code preview */}
              {videoModal.question.qrCodeSvg && (
                <div className="flex items-center gap-4 bg-muted/30 rounded-lg p-3 border border-border">
                  <div className="bg-white rounded p-1.5 shrink-0">
                    <div
                      className="w-16 h-16"
                      dangerouslySetInnerHTML={{ __html: videoModal.question.qrCodeSvg }}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground mb-0.5">Current QR Code</p>
                    <p className="text-xs text-muted-foreground truncate">{videoModal.question.videoUrl}</p>
                    <p className="text-xs text-muted-foreground mt-1">Students scan this in the Video Solutions tab.</p>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 pt-1">
                <Button
                  className="flex-1"
                  onClick={handleVideoSave}
                  disabled={updateQuestion.isPending || (!!videoUrlInput && !isYouTubeUrl(videoUrlInput))}
                >
                  {updateQuestion.isPending
                    ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    : <Save className="w-4 h-4 mr-2" />}
                  Save Changes
                </Button>
                {videoModal.question.videoUrl && (
                  <Button
                    variant="outline"
                    className="text-destructive border-destructive/30 hover:bg-destructive/10 shrink-0"
                    onClick={handleVideoClear}
                    disabled={updateQuestion.isPending}
                    title="Remove video URL and QR code"
                  >
                    <VideoOff className="w-4 h-4 mr-1" /> Remove Video
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Question Bank</h1>
          <p className="text-muted-foreground mt-1">
            Manage all test and quiz questions.
            {questions && <span className="ml-2 font-medium text-foreground">{questions.length} total</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Dialog open={isImportOpen} onOpenChange={(open) => { setIsImportOpen(open); if (!open) resetImport(); }}>
            <DialogTrigger asChild>
              <Button variant="outline"><Upload className="w-4 h-4 mr-2" /> Import CSV</Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-primary" /> Bulk Import Questions
                </DialogTitle>
              </DialogHeader>

              {!importResult ? (
                <div className="space-y-6 pt-2">
                  <Card className="border-dashed border-primary/30 bg-primary/5">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start gap-3 text-sm">
                        <AlertTriangle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                        <div className="space-y-1 text-muted-foreground">
                          <p className="font-medium text-foreground">CSV Format Requirements</p>
                          <p>Required columns: <code className="text-xs bg-muted px-1 rounded">text, option1, option2, option3, option4, correct_option</code></p>
                          <p>Optional columns: <code className="text-xs bg-muted px-1 rounded">marks</code> (default 4), <code className="text-xs bg-muted px-1 rounded">difficulty</code> (easy/medium/hard), <code className="text-xs bg-muted px-1 rounded">topic_id</code>, <code className="text-xs bg-muted px-1 rounded">text_solution</code></p>
                          <p><code className="text-xs bg-muted px-1 rounded">correct_option</code> is the 0-based index (0 = option1, 1 = option2, …)</p>
                          <p>Max 500 rows per import. UTF-8 encoding required.</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex items-center gap-3">
                    <Button variant="outline" size="sm" onClick={downloadTemplate} className="shrink-0">
                      <Download className="w-4 h-4 mr-2" /> Download Template
                    </Button>
                    <span className="text-xs text-muted-foreground">Start with the template to ensure correct column names.</span>
                  </div>

                  <div>
                    <Label className="mb-2 block">Select CSV File</Label>
                    <div
                      className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                      {importFile ? (
                        <div>
                          <p className="font-medium text-foreground">{importFile.name}</p>
                          <p className="text-sm text-muted-foreground mt-1">{parsedRows.length} rows detected</p>
                        </div>
                      ) : (
                        <div>
                          <p className="font-medium">Click to choose a CSV file</p>
                          <p className="text-sm text-muted-foreground mt-1">or drag and drop</p>
                        </div>
                      )}
                    </div>
                    <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
                  </div>

                  {parsedRows.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold">Preview ({parsedRows.length} rows)</h3>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="flex items-center gap-1.5 text-success">
                            <CheckCircle2 className="w-4 h-4" /> {validRows.length} valid
                          </span>
                          {invalidRows.length > 0 && (
                            <span className="flex items-center gap-1.5 text-destructive">
                              <XCircle className="w-4 h-4" /> {invalidRows.length} invalid
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="border border-border rounded-lg overflow-hidden">
                        <div className="max-h-64 overflow-y-auto">
                          <table className="w-full text-xs text-left">
                            <thead className="bg-muted/50 border-b border-border sticky top-0">
                              <tr>
                                <th className="px-3 py-2 font-medium text-muted-foreground w-8">#</th>
                                <th className="px-3 py-2 font-medium text-muted-foreground">Question</th>
                                <th className="px-3 py-2 font-medium text-muted-foreground">Difficulty</th>
                                <th className="px-3 py-2 font-medium text-muted-foreground">Marks</th>
                                <th className="px-3 py-2 font-medium text-muted-foreground">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {parsedRows.map((row) => (
                                <tr key={row.rowNum} className={`border-b border-border last:border-0 ${row.errors.length > 0 ? "bg-destructive/5" : "hover:bg-muted/10"}`}>
                                  <td className="px-3 py-2 text-muted-foreground">{row.rowNum}</td>
                                  <td className="px-3 py-2 max-w-xs">
                                    <div className="truncate font-medium">{row.text || <span className="text-muted-foreground italic">empty</span>}</div>
                                  </td>
                                  <td className="px-3 py-2 capitalize">{row.difficulty || "medium"}</td>
                                  <td className="px-3 py-2">{row.marks || "4"}</td>
                                  <td className="px-3 py-2">
                                    {row.errors.length === 0 ? (
                                      <span className="flex items-center gap-1 text-success"><CheckCircle2 className="w-3.5 h-3.5" /> Valid</span>
                                    ) : (
                                      <div>
                                        <span className="flex items-center gap-1 text-destructive"><XCircle className="w-3.5 h-3.5" /> Error</span>
                                        <ul className="mt-0.5 space-y-0.5">
                                          {row.errors.map((e, i) => <li key={i} className="text-destructive/80">• {e}</li>)}
                                        </ul>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {invalidRows.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Rows with errors will be skipped. Only the {validRows.length} valid row{validRows.length !== 1 ? "s" : ""} will be imported.
                        </p>
                      )}

                      <Button
                        onClick={handleImport}
                        disabled={validRows.length === 0 || isImporting}
                        className="w-full"
                      >
                        {isImporting ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing…</>
                        ) : (
                          <><Upload className="w-4 h-4 mr-2" /> Import {validRows.length} Question{validRows.length !== 1 ? "s" : ""}</>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-6 pt-2">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <Card className="bg-muted/30 border-border">
                      <CardContent className="pt-4 pb-4">
                        <div className="text-3xl font-bold">{importResult.total}</div>
                        <div className="text-xs text-muted-foreground mt-1">Total Rows</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-success/10 border-success/20">
                      <CardContent className="pt-4 pb-4">
                        <div className="text-3xl font-bold text-success">{importResult.imported}</div>
                        <div className="text-xs text-success/80 mt-1">Imported</div>
                      </CardContent>
                    </Card>
                    <Card className={importResult.failed > 0 ? "bg-destructive/10 border-destructive/20" : "bg-muted/30 border-border"}>
                      <CardContent className="pt-4 pb-4">
                        <div className={`text-3xl font-bold ${importResult.failed > 0 ? "text-destructive" : ""}`}>{importResult.failed}</div>
                        <div className={`text-xs mt-1 ${importResult.failed > 0 ? "text-destructive/80" : "text-muted-foreground"}`}>Failed</div>
                      </CardContent>
                    </Card>
                  </div>

                  {importResult.imported > 0 && (
                    <Progress value={(importResult.imported / importResult.total) * 100} className="h-2" />
                  )}

                  <div className="border border-border rounded-lg overflow-hidden">
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-muted/50 border-b border-border sticky top-0">
                          <tr>
                            <th className="px-3 py-2 font-medium text-muted-foreground w-8">#</th>
                            <th className="px-3 py-2 font-medium text-muted-foreground">Question</th>
                            <th className="px-3 py-2 font-medium text-muted-foreground">Result</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importResult.rows.map((row) => (
                            <tr key={row.row} className={`border-b border-border last:border-0 ${row.status === "failed" ? "bg-destructive/5" : ""}`}>
                              <td className="px-3 py-2 text-muted-foreground">{row.row}</td>
                              <td className="px-3 py-2 truncate max-w-xs">{row.question || "—"}</td>
                              <td className="px-3 py-2">
                                {row.status === "imported" ? (
                                  <span className="flex items-center gap-1 text-success"><CheckCircle2 className="w-3.5 h-3.5" /> Imported</span>
                                ) : (
                                  <span className="flex items-center gap-1 text-destructive"><XCircle className="w-3.5 h-3.5" /> {row.error}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button variant="outline" onClick={resetImport} className="flex-1">Import Another File</Button>
                    <Button onClick={() => { setIsImportOpen(false); resetImport(); }} className="flex-1">Done</Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" /> Add Question</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Question</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Question Text</Label>
                  <textarea
                    className="w-full min-h-[100px] p-3 rounded-md bg-background border border-input text-foreground resize-none"
                    value={newQ.text}
                    onChange={e => setNewQ({ ...newQ, text: e.target.value })}
                    placeholder="Enter the question…"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="space-y-2">
                      <Label>Option {i} (Index {i - 1})</Label>
                      <Input
                        value={newQ[`option${i}` as keyof typeof newQ] as string}
                        onChange={e => setNewQ({ ...newQ, [`option${i}`]: e.target.value })}
                        placeholder={`Option ${i}`}
                      />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Correct Option</Label>
                    <Select value={newQ.correctOption} onValueChange={val => setNewQ({ ...newQ, correctOption: val })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Option 1</SelectItem>
                        <SelectItem value="1">Option 2</SelectItem>
                        <SelectItem value="2">Option 3</SelectItem>
                        <SelectItem value="3">Option 4</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Marks</Label>
                    <Input type="number" value={newQ.marks} onChange={e => setNewQ({ ...newQ, marks: e.target.value })} min="1" />
                  </div>
                  <div className="space-y-2">
                    <Label>Difficulty</Label>
                    <Select value={newQ.difficulty} onValueChange={(val: "easy" | "medium" | "hard") => setNewQ({ ...newQ, difficulty: val })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="easy">Easy</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="hard">Hard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  onClick={handleCreate}
                  disabled={!newQ.text || !newQ.option1 || !newQ.option2 || !newQ.option3 || !newQ.option4 || createQuestion.isPending}
                  className="w-full mt-4"
                >
                  {createQuestion.isPending ? "Adding…" : "Add Question"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Video coverage summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-card-border bg-card">
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold">{questions?.length ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Total questions</div>
          </CardContent>
        </Card>
        <Card className="border-card-border bg-card border-green-500/20">
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-green-400">{withVideoCount}</div>
            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><Youtube className="w-3 h-3" /> Have video</div>
          </CardContent>
        </Card>
        <Card className="border-card-border bg-card border-muted">
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-muted-foreground">{withoutVideoCount}</div>
            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><VideoOff className="w-3 h-3" /> No video</div>
          </CardContent>
        </Card>
      </div>

      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9 pr-8"
            placeholder="Search questions…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearchQuery("")}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
          {(["all", "with", "without"] as const).map(f => (
            <button
              key={f}
              onClick={() => setVideoFilter(f)}
              className={`px-3 py-2 text-xs font-medium transition-colors ${videoFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
            >
              {f === "all" ? "All" : f === "with" ? "Has Video" : "No Video"}
            </button>
          ))}
        </div>
      </div>

      <Card className="border-card-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-4 font-medium w-5/12">Question</th>
                <th className="px-6 py-4 font-medium">Difficulty</th>
                <th className="px-6 py-4 font-medium">Marks</th>
                <th className="px-6 py-4 font-medium">Video</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuestions.map((q) => (
                <tr key={q.id} className="border-b border-border hover:bg-muted/20">
                  <td className="px-6 py-4">
                    <div className="font-medium text-foreground line-clamp-2">{q.text}</div>
                    <div className="text-xs text-muted-foreground mt-1">Topic: {q.topicId || "Unassigned"}</div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant="outline" className={difficultyBadgeClass(q.difficulty)}>
                      {q.difficulty}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">{q.marks}</td>
                  <td className="px-6 py-4">
                    <Button
                      size="sm"
                      variant={q.videoUrl ? "outline" : "ghost"}
                      onClick={() => openVideoModal(q)}
                      className={`h-8 gap-1.5 text-xs ${q.videoUrl ? "border-green-500/40 text-green-400 hover:bg-green-500/10" : "text-muted-foreground"}`}
                    >
                      {q.videoUrl ? (
                        <><Youtube className="w-3.5 h-3.5" /> Linked</>
                      ) : (
                        <><VideoOff className="w-3.5 h-3.5" /> Add</>
                      )}
                    </Button>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(q.id)} disabled={deleteQuestion.isPending} className="h-8 w-8 p-0">
                      <Trash className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filteredQuestions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <FileSpreadsheet className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                    {searchQuery || videoFilter !== "all" ? (
                      <>
                        <p className="text-muted-foreground">No questions match your filters.</p>
                        <p className="text-xs text-muted-foreground mt-1">Try clearing the search or changing the video filter.</p>
                      </>
                    ) : (
                      <>
                        <p className="text-muted-foreground">No questions yet.</p>
                        <p className="text-xs text-muted-foreground mt-1">Use "Import CSV" to bulk-add questions or "Add Question" for individual entries.</p>
                      </>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
