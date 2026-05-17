import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { ChevronRight, ArrowRight, Brain, Target, Video, ShieldCheck, FolderLock, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";

const slides = [
  {
    title: "Smart Mastery Path.",
    tagline: "Learn Deep, Not Fast.",
    description: "No shortcuts. Unlock new topics only after mastering the previous ones. Your progression is earned, not given.",
    icon: <Brain className="w-14 h-14 text-primary" />,
    color: "from-primary/20 to-background"
  },
  {
    title: "Real Exam Simulation.",
    tagline: "Train Like You Fight.",
    description: "Full-screen timer, question navigation grid, mark for review, and auto-submit — exactly like the real test.",
    icon: <ShieldCheck className="w-14 h-14 text-warning" />,
    color: "from-warning/20 to-background"
  },
  {
    title: "Instant Video Solutions.",
    tagline: "See It, Solve It.",
    description: "Scan a QR code to watch expert video explanations for every question — even when you're offline.",
    icon: <Video className="w-14 h-14 text-accent" />,
    color: "from-accent/20 to-background"
  },
  {
    title: "Distraction-Free Focus.",
    tagline: "Stay in the Zone.",
    description: "Built-in Pomodoro timer and smart task planner to keep you on track, hour after hour.",
    icon: <Timer className="w-14 h-14 text-secondary" />,
    color: "from-secondary/20 to-background"
  },
  {
    title: "Smart Note Vault.",
    tagline: "Earn Your Notes.",
    description: "Upload your notes only after completing a chapter — reinforcing learning at every step.",
    icon: <FolderLock className="w-14 h-14 text-success" />,
    color: "from-success/20 to-background"
  },
];

export default function Landing() {
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev === slides.length - 1 ? prev : prev + 1));
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const nextSlide = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background flex flex-col items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 z-0 bg-grid-slate-800/[0.04] bg-[size:32px_32px]" />
      
      <div className="w-full max-w-md mx-auto z-10 px-6 h-[600px] flex flex-col justify-between">
        
        <div className="flex-1 flex flex-col justify-center relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSlide}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 flex flex-col items-center justify-center text-center"
            >
              <div className={`p-6 rounded-full bg-gradient-to-b ${slides[currentSlide].color} mb-8 border border-border`}>
                {slides[currentSlide].icon}
              </div>
              <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-2">
                {slides[currentSlide].tagline}
              </p>
              <h1 className="text-3xl font-bold text-foreground mb-4 tracking-tight">
                {slides[currentSlide].title}
              </h1>
              <p className="text-muted-foreground text-base leading-relaxed">
                {slides[currentSlide].description}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="py-8 flex flex-col gap-6">
          <div className="flex justify-center gap-2">
            {slides.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentSlide ? "w-8 bg-primary" : "w-2 bg-muted"
                }`}
              />
            ))}
          </div>
          
          <div className="flex flex-col gap-3">
            {currentSlide === slides.length - 1 ? (
              <div className="flex flex-col gap-3">
                <Link href="/register">
                  <Button className="w-full text-lg h-14 font-semibold" size="lg">
                    Get Started <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </Link>
                <Link href="/login">
                  <Button variant="outline" className="w-full text-lg h-14" size="lg">
                    Login to Cockpit
                  </Button>
                </Link>
              </div>
            ) : (
              <Button onClick={nextSlide} className="w-full text-lg h-14" size="lg" variant="secondary">
                Next <ChevronRight className="ml-2 w-5 h-5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
