import { useListQrScans } from "@/hooks/use-tasks";
import type { QrScanEntry } from "@/hooks/use-admin";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScanLine, Video, BookOpen, Clock, ChevronRight, BarChart2, Repeat } from "lucide-react";
import { Layout } from "@/components/layout";

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateGroup(isoString: string): string {
  const d = new Date(isoString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}

function groupByDate(scans: QrScanEntry[]): { date: string; items: QrScanEntry[] }[] {
  const groups = new Map<string, QrScanEntry[]>();
  for (const scan of scans) {
    const key = new Date(scan.scannedAt).toDateString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(scan);
  }
  return Array.from(groups.entries()).map(([, items]) => ({
    date: formatDateGroup(items[0].scannedAt),
    items,
  }));
}

export default function QrHistory() {
  const { data: scans = [], isLoading } = useListQrScans({
    query: { queryKey: ["qr-scans"] },
  });

  const uniqueQuestions = new Set(scans.map((s) => s.questionId)).size;
  const topTopics = Object.entries(
    scans.reduce<Record<string, number>>((acc, s) => {
      const name = s.topicName ?? "Unknown";
      acc[name] = (acc[name] ?? 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const groups = groupByDate(scans);

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <ScanLine className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">QR Scan History</h1>
            <p className="text-sm text-muted-foreground">Every video solution you revisited after an exam</p>
          </div>
        </div>

        {!isLoading && scans.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <Card className="border-card-border">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/10">
                  <Repeat className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{scans.length}</p>
                  <p className="text-xs text-muted-foreground">Total scans</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-card-border">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-md bg-amber-500/10">
                  <Video className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{uniqueQuestions}</p>
                  <p className="text-xs text-muted-foreground">Unique questions</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-card-border">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-md bg-emerald-500/10">
                  <BarChart2 className="w-4 h-4 text-emerald-500" />
                </div>
                <div>
                  <p className="text-lg font-bold truncate">{topTopics[0]?.[0] ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">Top revisited topic</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {topTopics.length > 1 && (
          <Card className="border-card-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                Most Revisited Topics
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {topTopics.map(([name, count]) => (
                <div key={name} className="flex items-center gap-1.5 bg-primary/5 border border-primary/20 rounded-full px-3 py-1 text-sm">
                  <span className="font-medium">{name}</span>
                  <Badge variant="secondary" className="text-xs px-1.5 py-0">{count}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="border-card-border animate-pulse">
                <CardContent className="p-4 h-20" />
              </Card>
            ))}
          </div>
        ) : scans.length === 0 ? (
          <Card className="border-card-border">
            <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
              <div className="p-4 rounded-full bg-primary/10">
                <ScanLine className="w-8 h-8 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-lg">No scans yet</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  After finishing an exam, open the Videos tab and click any video solution link — it'll be logged here automatically.
                </p>
              </div>
              <Button variant="outline" asChild>
                <Link href="/subjects">Browse Subjects</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.date} className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                  {group.date}
                </p>
                <div className="space-y-2">
                  {group.items.map((scan) => (
                    <Card key={scan.id} className="border-card-border hover:border-primary/40 transition-colors">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-md bg-primary/10 shrink-0 mt-0.5">
                            <Video className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium line-clamp-2 leading-snug">
                              {scan.questionText}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                              {scan.topicName && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <BookOpen className="w-3 h-3" />
                                  {scan.topicName}
                                </span>
                              )}
                              {scan.examTitle && (
                                <span className="text-xs text-muted-foreground truncate max-w-[160px]">
                                  {scan.examTitle}
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto">
                                <Clock className="w-3 h-3" />
                                {formatRelativeTime(scan.scannedAt)}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            {scan.videoUrl && (
                              <a
                                href={scan.videoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline flex items-center gap-1"
                              >
                                Watch
                                <ChevronRight className="w-3 h-3" />
                              </a>
                            )}
                            {scan.resultId && (
                              <Link
                                href={`/results/${scan.resultId}`}
                                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                              >
                                Results
                                <ChevronRight className="w-3 h-3" />
                              </Link>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
