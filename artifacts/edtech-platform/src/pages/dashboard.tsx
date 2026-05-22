import { useGetDashboardSummary, useGetWeakTopics, useGetPerformanceTrend, useListTasks, useGetStudyHeatmap, useGetProgressSummary } from "@workspace/api-client-react";
import { Flame, Target, Trophy, CheckCircle, BookOpen, AlertCircle, ListTodo } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { useState, useRef } from "react";

// ─── Study Heatmap ────────────────────────────────────────────────────────────

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function countToLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

const LEVEL_CLASSES: Record<number, string> = {
  0: "bg-muted/25 border border-muted/10",
  1: "bg-primary/25 border border-primary/20",
  2: "bg-primary/50 border border-primary/40",
  3: "bg-primary/75 border border-primary/60",
  4: "bg-primary border border-primary/80",
};

type HeatmapEntry = { date: string; count: number; topics: string[] };

function StudyHeatmap({ data }: { data: HeatmapEntry[] }) {
  const [tooltip, setTooltip] = useState<{
    date: string; count: number; topics: string[]; x: number; y: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const activityMap = new Map<string, HeatmapEntry>();
  for (const entry of data) activityMap.set(entry.date, entry);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startSunday = new Date(today);
  startSunday.setDate(today.getDate() - today.getDay() - 52 * 7);

  const weeks: Date[][] = [];
  const cursor = new Date(startSunday);
  while (cursor <= today) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  const monthLabels: { label: string; colIndex: number }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, i) => {
    const m = week[0].getMonth();
    if (m !== lastMonth) {
      monthLabels.push({ label: MONTHS[m], colIndex: i });
      lastMonth = m;
    }
  });

  const totalStudied = data.reduce((s, e) => s + e.count, 0);
  const activeDays = data.length;

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>, day: Date) => {
    const dateStr = day.toISOString().split("T")[0];
    const entry = activityMap.get(dateStr);
    const rect = e.currentTarget.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    setTooltip({
      date: dateStr,
      count: entry?.count ?? 0,
      topics: entry?.topics ?? [],
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top,
    });
  };

  const CELL = 13;
  const GAP = 3;
  const CELL_TOTAL = CELL + GAP;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{activeDays} active days · {totalStudied} topic touch-points in the last year</span>
        <div className="flex items-center gap-1.5">
          <span>Less</span>
          {[0,1,2,3,4].map(l => (
            <span key={l} className={`inline-block w-3 h-3 rounded-sm ${LEVEL_CLASSES[l]}`} />
          ))}
          <span>More</span>
        </div>
      </div>

      <div ref={containerRef} className="relative overflow-x-auto pb-1">
        <div style={{ minWidth: weeks.length * CELL_TOTAL + 28 }}>
          <div className="relative" style={{ height: 18, marginLeft: 28 }}>
            {monthLabels.map(({ label, colIndex }) => (
              <span
                key={`${label}-${colIndex}`}
                className="absolute text-[10px] text-muted-foreground"
                style={{ left: colIndex * CELL_TOTAL }}
              >
                {label}
              </span>
            ))}
          </div>

          <div className="flex gap-0" style={{ gap: GAP }}>
            <div className="flex flex-col shrink-0" style={{ gap: GAP, width: 24 }}>
              {DAYS.map((d, i) => (
                <div
                  key={d}
                  className="text-[9px] text-muted-foreground text-right pr-1 flex items-center justify-end"
                  style={{
                    height: CELL,
                    visibility: i % 2 === 1 ? "visible" : "hidden",
                  }}
                >
                  {d}
                </div>
              ))}
            </div>

            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col shrink-0" style={{ gap: GAP }}>
                {week.map((day, di) => {
                  const dateStr = day.toISOString().split("T")[0];
                  const entry = activityMap.get(dateStr);
                  const level = countToLevel(entry?.count ?? 0);
                  const isFuture = day > today;

                  return (
                    <button
                      key={di}
                      type="button"
                      onMouseEnter={(e) => !isFuture && handleMouseEnter(e, day)}
                      onMouseLeave={() => setTooltip(null)}
                      className={`rounded-sm transition-all shrink-0 ${
                        isFuture
                          ? "bg-muted/10 border border-muted/5 cursor-default"
                          : `${LEVEL_CLASSES[level]} cursor-pointer hover:ring-1 hover:ring-primary/60`
                      }`}
                      style={{ width: CELL, height: CELL }}
                      aria-label={`${dateStr}: ${entry?.count ?? 0} topics`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {tooltip && (
          <div
            className="absolute z-50 pointer-events-none"
            style={{
              left: tooltip.x,
              top: tooltip.y - 8,
              transform: "translate(-50%, -100%)",
            }}
          >
            <div className="bg-popover border border-border rounded-lg shadow-xl p-3 text-xs max-w-[200px]">
              <p className="font-semibold text-foreground mb-1">
                {new Date(tooltip.date + "T00:00:00").toLocaleDateString("en-IN", {
                  weekday: "short", day: "numeric", month: "short", year: "numeric",
                })}
              </p>
              {tooltip.count === 0 ? (
                <p className="text-muted-foreground">No activity</p>
              ) : (
                <>
                  <p className="text-primary font-medium mb-1.5">
                    {tooltip.count} topic{tooltip.count !== 1 ? "s" : ""} studied
                  </p>
                  <ul className="space-y-0.5 text-muted-foreground">
                    {tooltip.topics.slice(0, 5).map((t) => (
                      <li key={t} className="truncate">• {t}</li>
                    ))}
                    {tooltip.topics.length > 5 && (
                      <li className="text-muted-foreground/70">
                        +{tooltip.topics.length - 5} more
                      </li>
                    )}
                  </ul>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: summary, isLoading: summaryLoading, error } = useGetDashboardSummary();
  const { data: weakTopics } = useGetWeakTopics();
  const { data: performanceTrend } = useGetPerformanceTrend();
  const { data: tasks } = useListTasks();
  const { data: heatmapData = [] } = useGetStudyHeatmap();
  const { data: progressSummary } = useGetProgressSummary();

  if (summaryLoading) {
    return <div className="p-8 text-muted-foreground">Loading dashboard...</div>;
  }

  if (error || !summary) {
    return <div className="p-8 text-destructive">Failed to load dashboard data.</div>;
  }

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto pb-24 md:pb-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome back, {summary.user.fullName.split(' ')[0]}</h1>
          <p className="text-muted-foreground mt-1">Ready for another focused session?</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border-card-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Focus Streak</CardTitle>
            <Flame className="w-5 h-5 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{summary.focusStreakDays} <span className="text-lg font-normal text-muted-foreground">days</span></div>
          </CardContent>
        </Card>

        <Card className="bg-card border-card-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today's Focus</CardTitle>
            <Target className="w-5 h-5 text-secondary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{summary.todayFocusMinutes} <span className="text-lg font-normal text-muted-foreground">/ {summary.focusGoalMinutes}m</span></div>
            <div className="w-full bg-muted rounded-full h-2 mt-3">
              <div className="bg-secondary h-2 rounded-full" style={{ width: `${Math.min(100, (summary.todayFocusMinutes / summary.focusGoalMinutes) * 100)}%` }} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-card-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Mastery Progress</CardTitle>
            <Trophy className="w-5 h-5 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{summary.overallProgressPercent}%</div>
            <div className="w-full bg-muted rounded-full h-2 mt-3">
              <div className="bg-accent h-2 rounded-full" style={{ width: `${summary.overallProgressPercent}%` }} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-card-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Subjects Completed</CardTitle>
            <CheckCircle className="w-5 h-5 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{summary.completedSubjects} <span className="text-lg font-normal text-muted-foreground">/ {summary.totalSubjects}</span></div>
          </CardContent>
        </Card>
      </div>

      {/* Study Heatmap */}
      <Card className="border-card-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <span className="w-2 h-2 rounded-full bg-primary inline-block" />
            Study Activity — Last 12 Months
          </CardTitle>
        </CardHeader>
        <CardContent>
          <StudyHeatmap data={heatmapData} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Next Action */}
          <Card className="border-card-border bg-card">
            <CardHeader>
              <CardTitle>Next Up</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.nextAction ? (
                <div className="p-6 border border-primary/30 bg-primary/10 rounded-lg flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div>
                    <h3 className="text-xl font-semibold text-primary">{summary.nextAction}</h3>
                    <p className="text-muted-foreground">Continue where you left off</p>
                  </div>
                  {summary.nextActionTarget && (
                    <Link href={summary.nextActionTarget}>
                      <Button className="w-full sm:w-auto">Resume Learning <BookOpen className="ml-2 w-4 h-4" /></Button>
                    </Link>
                  )}
                </div>
              ) : (
                <div className="text-center p-8 text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>You're all caught up! Great job.</p>
                  <Link href="/subjects">
                    <Button variant="outline" className="mt-4">Browse Subjects</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Performance Trend */}
          <Card className="border-card-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Performance Trend</span>
                <div className="flex items-center gap-4 text-xs text-muted-foreground font-normal">
                  <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-0.5 bg-primary rounded" />Platform Exams</span>
                  <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-0.5 bg-secondary rounded" />External Tests</span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {performanceTrend && performanceTrend.length > 0 ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={performanceTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" stroke="#94A3B8" fontSize={12} tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})} />
                      <YAxis stroke="#94A3B8" fontSize={12} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: '#1E293B', borderColor: '#334155', color: '#F8FAFC' }}
                        labelFormatter={(v) => new Date(v).toLocaleDateString()}
                        formatter={(value: number, name: string) => [
                          `${value}%`,
                          name === "averageScore" ? "Platform Avg" : "External Test",
                        ]}
                      />
                      <Legend
                        formatter={(value) => value === "averageScore" ? "Platform Exams" : "External Tests"}
                        wrapperStyle={{ fontSize: 12, color: '#94A3B8' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="averageScore"
                        stroke="#6366F1"
                        strokeWidth={3}
                        dot={{ fill: '#6366F1', r: 4 }}
                        activeDot={{ r: 6 }}
                        connectNulls={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="externalScore"
                        stroke="#10B981"
                        strokeWidth={2}
                        strokeDasharray="5 3"
                        dot={{ fill: '#10B981', r: 4 }}
                        activeDot={{ r: 6 }}
                        connectNulls={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  Not enough data for performance trend.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Weak Topics */}
          <Card className="border-card-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-warning" /> Weak Topics to Review
              </CardTitle>
            </CardHeader>
            <CardContent>
              {weakTopics && weakTopics.length > 0 ? (
                <div className="space-y-4">
                  {weakTopics.map((wt) => (
                    <div key={wt.topicId} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border border-border bg-background gap-4">
                      <div>
                        <h4 className="font-medium text-foreground">{wt.topicName}</h4>
                        <p className="text-sm text-muted-foreground">{wt.subjectName} • {wt.chapterName}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="font-bold text-lg text-warning">{wt.averageAccuracy}%</div>
                          <div className="text-xs text-muted-foreground">Accuracy</div>
                        </div>
                        <Link href={`/topics/${wt.topicId}`}>
                          <Button size="sm" variant="outline">Review</Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center p-8 text-muted-foreground">
                  No weak topics identified yet. Keep practicing!
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
          {/* Mastery Breakdown */}
          {progressSummary && (
            <Card className="border-card-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Trophy className="w-5 h-5 text-accent" /> Mastery Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Overall</span>
                    <span className="font-semibold text-foreground">{progressSummary.overallPercent}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${progressSummary.overallPercent}%` }} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 pt-1">
                  <div className="flex flex-col items-center p-2.5 rounded-lg bg-background border border-border text-center">
                    <span className="text-lg font-bold text-foreground">{progressSummary.completedSubjects}</span>
                    <span className="text-xs text-muted-foreground">/ {progressSummary.totalSubjects}</span>
                    <span className="text-xs text-muted-foreground mt-0.5">Subjects</span>
                  </div>
                  <div className="flex flex-col items-center p-2.5 rounded-lg bg-background border border-border text-center">
                    <span className="text-lg font-bold text-foreground">{progressSummary.completedChapters}</span>
                    <span className="text-xs text-muted-foreground">/ {progressSummary.totalChapters}</span>
                    <span className="text-xs text-muted-foreground mt-0.5">Chapters</span>
                  </div>
                  <div className="flex flex-col items-center p-2.5 rounded-lg bg-background border border-border text-center">
                    <span className="text-lg font-bold text-foreground">{progressSummary.completedTopics}</span>
                    <span className="text-xs text-muted-foreground">/ {progressSummary.totalTopics}</span>
                    <span className="text-xs text-muted-foreground mt-0.5">Topics</span>
                  </div>
                </div>
                {progressSummary.nextAction && (
                  <div className="text-xs text-muted-foreground pt-1 border-t border-border">
                    <span className="font-medium text-foreground">Next: </span>{progressSummary.nextAction}
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border">
                  <span>🔥 {progressSummary.focusStreakDays} day streak</span>
                  <span>{progressSummary.totalFocusMinutesToday} min today</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Today's Tasks */}
          <Card className="border-card-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ListTodo className="w-5 h-5 text-primary" /> Today's Tasks
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tasks && tasks.length > 0 ? (
                <div className="space-y-3">
                  {tasks.slice(0, 5).map(task => (
                    <div key={task.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-background">
                      <div className={`mt-0.5 w-4 h-4 rounded-full border flex shrink-0 ${task.status === 'completed' ? 'bg-success border-success' : 'border-muted-foreground'}`}>
                        {task.status === 'completed' && <CheckCircle className="w-3.5 h-3.5 text-success-foreground" />}
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${task.status === 'completed' ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                          {task.title}
                        </p>
                        {task.topicName && (
                          <p className="text-xs text-muted-foreground mt-0.5">{task.topicName}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <p className="text-sm">No tasks for today.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Results */}
          <Card className="border-card-border bg-card">
            <CardHeader>
              <CardTitle>Recent Tests</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.recentResults.length > 0 ? (
                <div className="space-y-4">
                  {summary.recentResults.slice(0, 4).map((result) => (
                    <div key={result.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-background">
                      <div className="flex-1 min-w-0 pr-4">
                        <h4 className="font-medium text-sm text-foreground truncate">{result.examTitle}</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">{new Date(result.submittedAt).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`font-bold text-sm ${result.passed ? 'text-success' : 'text-warning'}`}>
                          {result.score}/{result.maxScore}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center p-6 text-muted-foreground text-sm">
                  <p>No recent tests.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
