import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Flame, Target, Clock, BookCheck, Medal } from "lucide-react";

type LeaderboardEntry = {
  rank: number;
  userId: string;
  fullName: string;
  photoUrl: string | null;
  topicsCompleted: number;
  avgAccuracy: number;
  streakDays: number;
  totalFocusMinutes: number;
  examsAttempted: number;
  examsPassed: number;
  score: number;
  isCurrentUser: boolean;
};

type SortKey = "score" | "topicsCompleted" | "streakDays" | "avgAccuracy";

const SORT_OPTIONS: { key: SortKey; label: string; icon: React.ReactNode }[] = [
  { key: "score",           label: "Overall",       icon: <Trophy className="w-3.5 h-3.5" /> },
  { key: "topicsCompleted", label: "Topics Done",   icon: <BookCheck className="w-3.5 h-3.5" /> },
  { key: "streakDays",      label: "Streak",        icon: <Flame className="w-3.5 h-3.5" /> },
  { key: "avgAccuracy",     label: "Accuracy",      icon: <Target className="w-3.5 h-3.5" /> },
];

const RANK_STYLES: Record<number, { bg: string; border: string; text: string; label: string }> = {
  1: { bg: "bg-yellow-500/10", border: "border-yellow-500/30", text: "text-yellow-400", label: "🥇" },
  2: { bg: "bg-slate-400/10",  border: "border-slate-400/30",  text: "text-slate-300",  label: "🥈" },
  3: { bg: "bg-amber-700/10",  border: "border-amber-700/30",  text: "text-amber-600",  label: "🥉" },
};

function PodiumCard({ entry, position }: { entry: LeaderboardEntry; position: 1 | 2 | 3 }) {
  const style = RANK_STYLES[position];
  const heights = { 1: "h-28", 2: "h-20", 3: "h-16" };
  const orders  = { 1: "order-2", 2: "order-1", 3: "order-3" };

  return (
    <div className={`flex flex-col items-center gap-3 ${orders[position]}`}>
      <div className={`relative ${entry.isCurrentUser ? "ring-2 ring-primary ring-offset-2 ring-offset-background rounded-full" : ""}`}>
        <Avatar className="w-14 h-14 border-2 border-border">
          <AvatarImage src={entry.photoUrl ?? ""} />
          <AvatarFallback className="text-lg bg-muted text-muted-foreground">
            {entry.fullName.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <span className="absolute -bottom-1 -right-1 text-base">{style.label}</span>
      </div>

      <div className="text-center">
        <p className={`text-sm font-semibold truncate max-w-[96px] ${entry.isCurrentUser ? "text-primary" : "text-foreground"}`}>
          {entry.isCurrentUser ? "You" : entry.fullName.split(" ")[0]}
        </p>
        <p className={`text-xs font-bold ${style.text}`}>{entry.score} pts</p>
      </div>

      <div className={`w-20 rounded-t-md ${heights[position]} ${style.bg} border-t-2 border-x-2 ${style.border} flex items-end justify-center pb-2`}>
        <span className={`text-2xl font-black ${style.text}`}>{position}</span>
      </div>
    </div>
  );
}

export default function Leaderboard() {
  const [sortKey, setSortKey] = useState<SortKey>("score");

  const { data: raw = [], isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const token = localStorage.getItem("edtech_token");
      const res = await fetch("/api/leaderboard", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return res.json();
    },
    staleTime: 60_000,
  });

  const sorted = [...raw].sort((a, b) => {
    if (sortKey === "score")           return b.score - a.score;
    if (sortKey === "topicsCompleted") return b.topicsCompleted - a.topicsCompleted;
    if (sortKey === "streakDays")      return b.streakDays - a.streakDays;
    if (sortKey === "avgAccuracy")     return b.avgAccuracy - a.avgAccuracy;
    return 0;
  }).map((e, i) => ({ ...e, rank: i + 1 }));

  const me = sorted.find((e) => e.isCurrentUser);
  const top3 = raw.slice(0, 3);

  if (isLoading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-64 gap-3">
        <Trophy className="w-10 h-10 text-muted-foreground/40 animate-pulse" />
        <p className="text-muted-foreground">Loading leaderboard…</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-8 pb-24 md:pb-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Trophy className="w-8 h-8 text-yellow-400" /> Leaderboard
        </h1>
        <p className="text-muted-foreground mt-1">
          Ranked by overall score — topics completed, accuracy, streak, and focus time.
        </p>
      </div>

      {me && (
        <Card className={`border-card-border ${me.rank <= 3 ? "border-yellow-500/30 bg-yellow-500/5" : "bg-primary/5 border-primary/20"}`}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-black
                  ${me.rank === 1 ? "bg-yellow-500/20 text-yellow-400" :
                    me.rank === 2 ? "bg-slate-400/20 text-slate-300" :
                    me.rank === 3 ? "bg-amber-700/20 text-amber-600" :
                    "bg-primary/10 text-primary"}`}>
                  {me.rank <= 3 ? ["🥇","🥈","🥉"][me.rank - 1] : `#${me.rank}`}
                </div>
                <div>
                  <p className="font-semibold text-foreground">Your Rank</p>
                  <p className="text-sm text-muted-foreground">{me.score} pts · {sorted.length} students</p>
                </div>
              </div>
              <div className="flex items-center gap-6 flex-wrap text-sm">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <BookCheck className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-foreground">{me.topicsCompleted}</span> topics
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Target className="w-4 h-4 text-secondary" />
                  <span className="font-semibold text-foreground">{me.avgAccuracy}%</span> accuracy
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Flame className="w-4 h-4 text-orange-400" />
                  <span className="font-semibold text-foreground">{me.streakDays}</span> day streak
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="font-semibold text-foreground">{me.totalFocusMinutes}</span> min focused
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {top3.length >= 3 && (
        <Card className="border-card-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-muted-foreground font-medium">Top 3</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-center gap-4 pt-4 pb-2">
              {[
                top3[1] ? { entry: top3[1], pos: 2 as const } : null,
                top3[0] ? { entry: top3[0], pos: 1 as const } : null,
                top3[2] ? { entry: top3[2], pos: 3 as const } : null,
              ].filter(Boolean).map((item) => (
                <PodiumCard key={item!.entry.userId} entry={item!.entry} position={item!.pos} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-semibold">Full Rankings</h2>
          <Tabs value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <TabsList className="h-8">
              {SORT_OPTIONS.map((opt) => (
                <TabsTrigger key={opt.key} value={opt.key} className="text-xs px-3 h-7 flex items-center gap-1.5">
                  {opt.icon} {opt.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <Card className="border-card-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-medium w-12">Rank</th>
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium text-center">
                    <span className="flex items-center justify-center gap-1"><BookCheck className="w-3.5 h-3.5" /> Topics</span>
                  </th>
                  <th className="px-4 py-3 font-medium text-center">
                    <span className="flex items-center justify-center gap-1"><Target className="w-3.5 h-3.5" /> Accuracy</span>
                  </th>
                  <th className="px-4 py-3 font-medium text-center">
                    <span className="flex items-center justify-center gap-1"><Flame className="w-3.5 h-3.5" /> Streak</span>
                  </th>
                  <th className="px-4 py-3 font-medium text-center">
                    <span className="flex items-center justify-center gap-1"><Clock className="w-3.5 h-3.5" /> Focus</span>
                  </th>
                  <th className="px-4 py-3 font-medium text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((entry) => {
                  const rankStyle = RANK_STYLES[entry.rank];
                  return (
                    <tr
                      key={entry.userId}
                      className={`border-b border-border last:border-0 transition-colors
                        ${entry.isCurrentUser
                          ? "bg-primary/5 hover:bg-primary/10"
                          : "hover:bg-muted/20"
                        }`}
                    >
                      <td className="px-4 py-3.5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                          ${rankStyle
                            ? `${rankStyle.bg} ${rankStyle.text}`
                            : "bg-muted text-muted-foreground"
                          }`}>
                          {entry.rank <= 3 ? ["🥇","🥈","🥉"][entry.rank - 1] : entry.rank}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar className={`w-8 h-8 ${entry.isCurrentUser ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : ""}`}>
                            <AvatarImage src={entry.photoUrl ?? ""} />
                            <AvatarFallback className="text-xs bg-muted">{entry.fullName.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <span className={`font-medium ${entry.isCurrentUser ? "text-primary" : "text-foreground"}`}>
                              {entry.fullName}
                              {entry.isCurrentUser && <span className="ml-1.5 text-xs text-primary/70">(you)</span>}
                            </span>
                            <div className="text-xs text-muted-foreground">
                              {entry.examsAttempted} exam{entry.examsAttempted !== 1 ? "s" : ""} · {entry.examsPassed} passed
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center font-semibold">{entry.topicsCompleted}</td>
                      <td className="px-4 py-3.5 text-center">
                        <Badge variant="outline" className={
                          entry.avgAccuracy >= 80 ? "bg-success/10 text-success border-success/20" :
                          entry.avgAccuracy >= 50 ? "bg-warning/10 text-warning border-warning/20" :
                          "bg-muted text-muted-foreground"
                        }>
                          {entry.avgAccuracy}%
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="flex items-center justify-center gap-1">
                          {entry.streakDays > 0 && <Flame className="w-3.5 h-3.5 text-orange-400" />}
                          <span className={entry.streakDays > 0 ? "font-semibold text-orange-400" : "text-muted-foreground"}>
                            {entry.streakDays}d
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center text-muted-foreground text-xs">
                        {entry.totalFocusMinutes >= 60
                          ? `${Math.floor(entry.totalFocusMinutes / 60)}h ${entry.totalFocusMinutes % 60}m`
                          : `${entry.totalFocusMinutes}m`}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span className={`font-bold text-base ${entry.isCurrentUser ? "text-primary" : "text-foreground"}`}>
                          {entry.score}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                      <Medal className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
                      No students on the leaderboard yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <p className="text-xs text-muted-foreground text-center">
          Score = (topics × 10) + (accuracy × 2) + (streak days × 5) + (focus hours capped at 50 pts). Updates in real time.
        </p>
      </div>
    </div>
  );
}
