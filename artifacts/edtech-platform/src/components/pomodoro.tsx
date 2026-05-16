import { useState, useEffect } from "react";
import { useCreatePomodoroSession } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Play, Pause, Square, Timer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function PomodoroWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<"focus" | "shortBreak" | "longBreak">("focus");
  
  const createSession = useCreatePomodoroSession();
  const { toast } = useToast();

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (isActive && timeLeft === 0) {
      setIsActive(false);
      
      // Play sound
      try {
        const audio = new Audio("https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg");
        audio.play().catch(e => console.error("Audio play failed", e));
      } catch (e) {
        console.error("Audio init failed", e);
      }
      
      if (mode === "focus") {
        createSession.mutate({ 
          data: { 
            durationSeconds: 25 * 60,
            startTime: new Date(Date.now() - (25 * 60 * 1000)).toISOString(),
            endTime: new Date().toISOString()
          } 
        });
        toast({ title: "Focus session completed!", description: "Great job. Take a break." });
        setMode("shortBreak");
        setTimeLeft(5 * 60);
      } else {
        toast({ title: "Break ended", description: "Ready to focus again?" });
        setMode("focus");
        setTimeLeft(25 * 60);
      }
    }
    
    return () => clearInterval(interval);
  }, [isActive, timeLeft, mode]);

  const toggleTimer = () => setIsActive(!isActive);
  
  const resetTimer = () => {
    setIsActive(false);
    setTimeLeft(mode === "focus" ? 25 * 60 : mode === "shortBreak" ? 5 * 60 : 15 * 60);
  };
  
  const setTimerMode = (newMode: "focus" | "shortBreak" | "longBreak", minutes: number) => {
    setMode(newMode);
    setTimeLeft(minutes * 60);
    setIsActive(false);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 md:bottom-6 right-6 z-50 w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center justify-center hover:bg-primary/90 transition-transform hover:scale-105"
      >
        <Timer className="w-6 h-6" />
      </button>
    );
  }

  return (
    <Card className="fixed bottom-20 md:bottom-6 right-6 z-50 w-72 bg-card border-card-border shadow-xl shadow-black/20 overflow-hidden">
      <div className="bg-primary p-3 flex justify-between items-center text-primary-foreground">
        <div className="flex items-center gap-2 font-semibold">
          <Timer className="w-4 h-4" /> Pomodoro
        </div>
        <button onClick={() => setIsOpen(false)} className="hover:bg-primary-foreground/20 rounded p-1">
          <Square className="w-4 h-4" />
        </button>
      </div>
      
      <div className="p-4 space-y-4">
        <div className="flex justify-between gap-1 text-xs">
          <button 
            onClick={() => setTimerMode("focus", 25)}
            className={`flex-1 py-1 rounded ${mode === "focus" ? "bg-primary/20 text-primary font-medium" : "text-muted-foreground hover:bg-muted"}`}
          >
            25m Focus
          </button>
          <button 
            onClick={() => setTimerMode("shortBreak", 5)}
            className={`flex-1 py-1 rounded ${mode === "shortBreak" ? "bg-primary/20 text-primary font-medium" : "text-muted-foreground hover:bg-muted"}`}
          >
            5m Break
          </button>
          <button 
            onClick={() => setTimerMode("longBreak", 15)}
            className={`flex-1 py-1 rounded ${mode === "longBreak" ? "bg-primary/20 text-primary font-medium" : "text-muted-foreground hover:bg-muted"}`}
          >
            15m Break
          </button>
        </div>

        <div className="text-center py-4">
          <div className="text-5xl font-bold font-mono tracking-tighter text-foreground">
            {formatTime(timeLeft)}
          </div>
        </div>

        <div className="flex justify-center gap-4">
          <Button 
            variant="outline" 
            size="icon" 
            className="w-12 h-12 rounded-full border-border hover:bg-muted"
            onClick={resetTimer}
          >
            <Square className="w-5 h-5" />
          </Button>
          <Button 
            size="icon" 
            className="w-14 h-14 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-md"
            onClick={toggleTimer}
          >
            {isActive ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
          </Button>
        </div>
      </div>
    </Card>
  );
}
