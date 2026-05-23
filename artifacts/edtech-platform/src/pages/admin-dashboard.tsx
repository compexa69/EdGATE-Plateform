import { useState, useEffect } from "react";
import { useGetAdminStats } from "@/hooks/use-dashboard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, BookOpen, FileQuestion, HardDrive, UserCheck, ListChecks, AlertTriangle, TrendingDown, MousePointerClick, Settings, Send, Bell, QrCode, Radio, RefreshCcw, Clock } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";

interface LowCtrTopic {
  topicId: string;
  topicName: string;
  totalClicks: number;
  uniqueClickers: number;
  ctrPercent: number;
}

interface QrAnalytics {
  totalScans: number;
  uniqueStudents: number;
  topQuestions: Array<{ questionId: string; scanCount: number }>;
  recentScans: Array<{ id: string; questionId: string; userId: string; userName: string | null; scannedAt: string; examId: string | null }>;
}

interface LiveAttempt {
  id: string;
  userId: string;
  examId: string;
  status: string;
  startTime: string;
  remainingSeconds: number;
  pauseCount: number;
  userName: string | null;
  examTitle: string | null;
  examType: string | null;
  elapsedMinutes: number;
}

function getToken() { return localStorage.getItem("edtech_token") ?? ""; }

async function fetchQrAnalytics(): Promise<QrAnalytics> {
  const res = await fetch("/api/admin/qr-analytics", { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error("Failed to fetch QR analytics");
  return res.json();
}

async function fetchLiveAttempts(): Promise<LiveAttempt[]> {
  const res = await fetch("/api/admin/live-attempts", { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error("Failed to fetch live attempts");
  return res.json();
}

async function broadcastNotification(data: { title: string; message: string }) {
  const res = await fetch("/api/admin/notifications/broadcast", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to send broadcast");
  return res.json() as Promise<{ success: boolean; sent: number }>;
}

function LiveAttemptsWidget() {
  const { data: attempts, isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["admin-live-attempts"],
    queryFn: fetchLiveAttempts,
    refetchInterval: 30_000,
  });

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "—";

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  return (
    <Card className="border-card-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Radio className="w-4 h-4 text-success animate-pulse" />
            Live Exam Monitor
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Updated {lastUpdated}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refetch()} title="Refresh">
              <RefreshCcw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        <CardDescription>Auto-refreshes every 30 seconds</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-4 text-muted-foreground text-sm">Loading…</div>
        ) : !attempts || attempts.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm bg-muted/20 rounded-lg border border-dashed border-border">
            No students are currently in an exam.
          </div>
        ) : (
          <div className="space-y-2">
            {attempts.map((a) => (
              <div key={a.id} className="flex items-center gap-3 p-3 bg-muted/20 rounded-lg border border-border/50">
                <div className="w-2 h-2 rounded-full bg-success shrink-0 animate-pulse" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{a.userName ?? "Unknown"}</span>
                    <Badge variant="outline" className="text-xs h-5 capitalize shrink-0">{a.examType?.replace(/_/g, " ")}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">{a.examTitle ?? a.examId}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" /> {a.elapsedMinutes}m elapsed
                  </div>
                  <div className="text-xs font-mono text-primary">{formatTime(a.remainingSeconds)} left</div>
                </div>
              </div>
            ))}
            <p className="text-xs text-center text-muted-foreground pt-1">{attempts.length} student{attempts.length !== 1 ? "s" : ""} currently in exams</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QrAnalyticsWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-qr-analytics"],
    queryFn: fetchQrAnalytics,
    staleTime: 60_000,
  });

  return (
    <Card className="border-card-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <QrCode className="w-4 h-4 text-primary" /> QR Scan Analytics
        </CardTitle>
        <CardDescription>Students scanning question QR codes for solutions</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="text-center py-4 text-muted-foreground text-sm">Loading…</div>
        ) : !data ? (
          <div className="text-center py-4 text-muted-foreground text-sm">No data</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-center">
                <div className="text-2xl font-bold text-foreground">{data.totalScans.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Total Scans</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-center">
                <div className="text-2xl font-bold text-foreground">{data.uniqueStudents.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Unique Students</div>
              </div>
            </div>

            {data.topQuestions.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Most-Scanned Questions</p>
                <div className="space-y-1.5">
                  {data.topQuestions.slice(0, 5).map((q, i) => (
                    <div key={q.questionId} className="flex items-center gap-3">
                      <span className="shrink-0 text-xs text-muted-foreground w-4">{i + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${Math.round((q.scanCount / (data.topQuestions[0]?.scanCount || 1)) * 100)}%` }}
                          />
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">{q.scanCount}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.recentScans.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Recent Scans</p>
                <div className="space-y-1">
                  {data.recentScans.slice(0, 4).map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-foreground truncate">{s.userName ?? "Unknown"}</span>
                      <span className="text-muted-foreground shrink-0">{new Date(s.scannedAt).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.totalScans === 0 && (
              <div className="text-center py-4 text-muted-foreground text-sm bg-muted/20 rounded-lg border border-dashed border-border">
                No QR scans recorded yet.
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const { data: stats, isLoading } = useGetAdminStats();
  const { toast } = useToast();
  const [broadcastForm, setBroadcastForm] = useState({ title: "", message: "" });

  const broadcastMutation = useMutation({
    mutationFn: broadcastNotification,
    onSuccess: (result) => {
      toast({ title: "Broadcast sent", description: `Delivered to ${result.sent} student${result.sent !== 1 ? "s" : ""}.` });
      setBroadcastForm({ title: "", message: "" });
    },
    onError: () => toast({ title: "Broadcast failed", variant: "destructive" }),
  });

  if (isLoading) return <div className="p-8">Loading stats...</div>;
  if (!stats) return <div className="p-8 text-destructive">Failed to load admin stats</div>;

  const storagePercent = (stats.storageUsedBytes / stats.storageLimitBytes) * 100;
  const gbUsed = (stats.storageUsedBytes / (1024 * 1024 * 1024)).toFixed(2);
  const gbTotal = (stats.storageLimitBytes / (1024 * 1024 * 1024)).toFixed(2);
  const totalLectureClicks = (stats as any).totalLectureClicks as number ?? 0;
  const lowCtrTopics = ((stats as any).lowCtrTopics as LowCtrTopic[]) ?? [];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 pb-24 md:pb-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Overview</h1>
        <p className="text-muted-foreground mt-1">Platform statistics and quick actions.</p>
      </div>

      {/* Stat Cards Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-card-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
            <Users className="w-5 h-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{stats.totalUsers}</div>
            <p className="text-xs text-muted-foreground mt-1">{stats.activeUsers} active</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-card-border border-l-4 border-l-warning">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Approvals</CardTitle>
            <UserCheck className="w-5 h-5 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-warning">{stats.pendingApproval}</div>
            {stats.pendingApproval > 0 && (
              <Link href="/admin/users">
                <Button variant="link" className="p-0 h-auto text-xs mt-1">Review now &rarr;</Button>
              </Link>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-card-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Content Structure</CardTitle>
            <BookOpen className="w-5 h-5 text-secondary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{stats.totalSubjects} <span className="text-lg font-normal text-muted-foreground">Sub</span></div>
            <p className="text-xs text-muted-foreground mt-1">{stats.totalChapters} Ch | {stats.totalTopics} Top</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-card-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Question Bank</CardTitle>
            <FileQuestion className="w-5 h-5 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{stats.totalQuestions}</div>
            <p className="text-xs text-muted-foreground mt-1">{stats.totalExamsAttempted} attempts logged</p>
          </CardContent>
        </Card>
      </div>

      {/* Stat Cards Row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card border-card-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Lecture Engagement</CardTitle>
            <MousePointerClick className="w-5 h-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{totalLectureClicks.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Total lecture clicks across all topics</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-card-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Low-CTR Topics</CardTitle>
            <TrendingDown className="w-5 h-5 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">{lowCtrTopics.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Topics with &lt;10% lecture click-through</p>
          </CardContent>
        </Card>
      </div>

      {/* Live Monitor + QR Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LiveAttemptsWidget />
        <QrAnalyticsWidget />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="border-card-border bg-card">
          <CardHeader>
            <CardTitle>Quick Links</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link href="/admin/users" className="p-4 border border-border rounded-lg hover:border-primary/50 transition-colors group">
              <Users className="w-8 h-8 text-primary mb-3 group-hover:scale-110 transition-transform" />
              <h3 className="font-semibold text-lg mb-1">User Management</h3>
              <p className="text-sm text-muted-foreground">Approve, suspend, roles</p>
            </Link>
            <Link href="/admin/subjects" className="p-4 border border-border rounded-lg hover:border-primary/50 transition-colors group">
              <BookOpen className="w-8 h-8 text-secondary mb-3 group-hover:scale-110 transition-transform" />
              <h3 className="font-semibold text-lg mb-1">Content Manager</h3>
              <p className="text-sm text-muted-foreground">Subjects, chapters, topics</p>
            </Link>
            <Link href="/admin/questions" className="p-4 border border-border rounded-lg hover:border-primary/50 transition-colors group">
              <FileQuestion className="w-8 h-8 text-accent mb-3 group-hover:scale-110 transition-transform" />
              <h3 className="font-semibold text-lg mb-1">Question Bank</h3>
              <p className="text-sm text-muted-foreground">Add/edit questions, bulk import</p>
            </Link>
            <Link href="/admin/exams" className="p-4 border border-border rounded-lg hover:border-primary/50 transition-colors group">
              <ListChecks className="w-8 h-8 text-primary mb-3 group-hover:scale-110 transition-transform" />
              <h3 className="font-semibold text-lg mb-1">Exam Management</h3>
              <p className="text-sm text-muted-foreground">Create exams, assign questions</p>
            </Link>
            <Link href="/admin/settings" className="p-4 border border-border rounded-lg hover:border-primary/50 transition-colors group col-span-full sm:col-span-1">
              <Settings className="w-8 h-8 text-muted-foreground mb-3 group-hover:scale-110 transition-transform" />
              <h3 className="font-semibold text-lg mb-1">System Settings</h3>
              <p className="text-sm text-muted-foreground">Gate thresholds, audit logs</p>
            </Link>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-card-border bg-card">
            <CardHeader>
              <CardTitle>System Storage (B2)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <div>
                    <div className="text-3xl font-bold text-foreground">{gbUsed} GB</div>
                    <div className="text-sm text-muted-foreground">used of {gbTotal} GB</div>
                  </div>
                  <HardDrive className={`w-8 h-8 ${storagePercent > 90 ? 'text-destructive' : 'text-muted-foreground'}`} />
                </div>
                <div className="w-full bg-muted rounded-full h-3">
                  <div
                    className={`h-full rounded-full ${storagePercent > 90 ? 'bg-destructive' : storagePercent > 70 ? 'bg-warning' : 'bg-primary'}`}
                    style={{ width: `${Math.min(100, storagePercent)}%` }}
                  />
                </div>
                {storagePercent > 90 && (
                  <p className="text-sm text-destructive font-medium flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" /> Storage critical. Clear old files.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {lowCtrTopics.length > 0 && (
            <Card className="border-card-border bg-card border-l-4 border-l-destructive">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-destructive" />
                  Low Lecture Engagement
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">Topics with &lt;10% student click-through rate — consider reviewing lecture links.</p>
                <div className="space-y-2">
                  {lowCtrTopics.slice(0, 6).map((t) => (
                    <div key={t.topicId} className="flex items-center justify-between gap-3">
                      <span className="text-sm text-foreground truncate flex-1">{t.topicName}</span>
                      <Badge variant={t.ctrPercent === 0 ? "destructive" : "outline"} className="shrink-0 text-xs">
                        {t.ctrPercent}% CTR
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Card className="border-card-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            Broadcast Announcement
          </CardTitle>
          <CardDescription>Send a notification to all approved students on the platform.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bc-title">Title</Label>
            <Input
              id="bc-title"
              placeholder="e.g. JEE Mains mock test live now"
              value={broadcastForm.title}
              onChange={(e) => setBroadcastForm((f) => ({ ...f, title: e.target.value }))}
              className="bg-background"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bc-message">Message</Label>
            <Textarea
              id="bc-message"
              placeholder="Write your announcement here…"
              rows={3}
              value={broadcastForm.message}
              onChange={(e) => setBroadcastForm((f) => ({ ...f, message: e.target.value }))}
              className="bg-background resize-none"
            />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => broadcastMutation.mutate(broadcastForm)}
              disabled={!broadcastForm.title.trim() || !broadcastForm.message.trim() || broadcastMutation.isPending}
              className="gap-2"
            >
              {broadcastMutation.isPending ? "Sending…" : <><Send className="w-4 h-4" /> Send to All Students</>}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
