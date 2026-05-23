import { useState, useEffect } from "react";
import { useCreatePomodoroSession } from "@/hooks/use-tasks";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Play, Pause, Square, Timer, Settings, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PomodoroWidgetProps {
  topicId?: string;
}

type PomodoroMode = "focus" | "shortBreak" | "longBreak" | "custom";

export function PomodoroWidget({ topicId }: PomodoroWidgetProps = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<PomodoroMode>("focus");
  const [showCustom, setShowCustom] = useState(false);
  const [customWorkMins, setCustomWorkMins] = useState("25");
  const [customBreakMins, setCustomBreakMins] = useState("5");
  const [activeFocusDuration, setActiveFocusDuration] = useState(25 * 60);

  const createSession = useCreatePomodoroSession();
  const { toast } = useToast();

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (isActive && timeLeft === 0) {
      setIsActive(false);

      try {
        const audio = new Audio("https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg");
        audio.play().catch(() => {});
      } catch {}

      if (mode === "focus" || mode === "custom") {
        createSession.mutate({
          data: {
            durationSeconds: activeFocusDuration,
            startTime: new Date(Date.now() - activeFocusDuration * 1000).toISOString(),
            endTime: new Date().toISOString(),
            ...(topicId ? { topicId } : {}),
          },
        });
        toast({ title: "Focus session complete!", description: "Great work. Take a break." });
        const breakSecs = mode === "custom"
          ? Math.max(1, parseInt(customBreakMins) || 5) * 60
          : 5 * 60;
        setTimeLeft(breakSecs);
        setMode("shortBreak");
      } else {
        toast({ title: "Break over!", description: "Ready to focus again?" });
        // In the else branch mode is "shortBreak" | "longBreak" — always restore activeFocusDuration
        setTimeLeft(activeFocusDuration);
        setMode("focus");
      }
    }

    return () => clearInterval(interval);
  }, [isActive, timeLeft, mode]);

  const setTimerMode = (newMode: PomodoroMode, seconds: number) => {
    setMode(newMode);
    setTimeLeft(seconds);
    setIsActive(false);
    if (newMode === "focus" || newMode === "custom") setActiveFocusDuration(seconds);
  };

  const resetTimer = () => {
    setIsActive(false);
    if (mode === "focus") setTimeLeft(activeFocusDuration);
    else if (mode === "shortBreak") setTimeLeft(5 * 60);
    else if (mode === "longBreak") setTimeLeft(15 * 60);
    else setTimeLeft(activeFocusDuration);
  };

  const handleApplyCustom = () => {
    const work = Math.min(120, Math.max(1, parseInt(customWorkMins) || 25));
    const brk = Math.min(60, Math.max(1, parseInt(customBreakMins) || 5));
    setCustomWorkMins(String(work));
    setCustomBreakMins(String(brk));
    setTimerMode("custom", work * 60);
    setShowCustom(false);
    toast({ title: "Custom timer set", description: `${work}m focus / ${brk}m break` });
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const modeLabel: Record<PomodoroMode, string> = {
    focus: "Focus",
    shortBreak: "Short Break",
    longBreak: "Long Break",
    custom: "Custom",
  };

  const progress = (() => {
    const total =
      mode === "focus" ? activeFocusDuration
      : mode === "shortBreak" ? 5 * 60
      : mode === "longBreak" ? 15 * 60
      : activeFocusDuration;
    return total > 0 ? ((total - timeLeft) / total) * 100 : 0;
  })();

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 md:bottom-6 right-6 z-50 w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center justify-center hover:bg-primary/90 transition-transform hover:scale-105"
        aria-label="Open Pomodoro Timer"
      >
        <Timer className="w-6 h-6" />
      </button>
    );
  }

  return (
    <Card className="fixed bottom-20 md:bottom-6 right-6 z-50 w-72 bg-card border-card-border shadow-xl shadow-black/20 overflow-hidden">
      <div className="bg-primary p-3 flex justify-between items-center text-primary-foreground">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Timer className="w-4 h-4" />
          Pomodoro
          {mode !== "focus" && mode !== "shortBreak" && mode !== "longBreak" && (
            <span className="text-xs font-normal opacity-80">· Custom</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowCustom((v) => !v)}
            className="hover:bg-primary-foreground/20 rounded p-1"
            aria-label="Custom timer settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button onClick={() => setIsOpen(false)} className="hover:bg-primary-foreground/20 rounded p-1" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showCustom && (
        <div className="px-4 py-3 bg-muted/40 border-b border-border space-y-3">
          <p className="text-xs font-semibold text-foreground">Custom Durations (minutes)</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Focus</label>
              <input
                type="number"
                min={1}
                max={120}
                value={customWorkMins}
                onChange={(e) => setCustomWorkMins(e.target.value)}
                className="w-full mt-1 px-2 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Break</label>
              <input
                type="number"
                min={1}
                max={60}
                value={customBreakMins}
                onChange={(e) => setCustomBreakMins(e.target.value)}
                className="w-full mt-1 px-2 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <Button size="sm" className="w-full h-8 text-xs" onClick={handleApplyCustom}>
            Apply Custom Timer
          </Button>
        </div>
      )}

      <div className="p-4 space-y-4">
        <div className="flex gap-1 text-xs">
          {(["focus", "shortBreak", "longBreak"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setTimerMode(m, m === "focus" ? 25 * 60 : m === "shortBreak" ? 5 * 60 : 15 * 60)}
              className={`flex-1 py-1 rounded transition-colors ${
                mode === m
                  ? "bg-primary/20 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {m === "focus" ? "25m" : m === "shortBreak" ? "5m" : "15m"}
            </button>
          ))}
          {mode === "custom" && (
            <button
              className="flex-1 py-1 rounded bg-primary/20 text-primary font-medium text-xs"
            >
              {Math.floor(activeFocusDuration / 60)}m
            </button>
          )}
        </div>

        <div className="text-center py-2 relative">
          <div className="text-5xl font-bold font-mono tracking-tighter text-foreground">
            {formatTime(timeLeft)}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{modeLabel[mode]}</p>
          <div className="mt-3 h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-1000"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="flex justify-center gap-4">
          <Button
            variant="outline"
            size="icon"
            className="w-12 h-12 rounded-full border-border hover:bg-muted"
            onClick={resetTimer}
            aria-label="Reset"
          >
            <Square className="w-5 h-5" />
          </Button>
          <Button
            size="icon"
            className="w-14 h-14 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-md"
            onClick={() => setIsActive((v) => !v)}
            aria-label={isActive ? "Pause" : "Start"}
          >
            {isActive ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
          </Button>
        </div>
      </div>
    </Card>
  );
}
