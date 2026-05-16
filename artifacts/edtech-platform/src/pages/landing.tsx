import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { ChevronRight, ArrowRight, Brain, Target, Video, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const slides = [
  {
    title: "Mastery Awaits.",
    description: "Welcome to the cockpit for serious competitive exam preparation.",
    icon: <Target className="w-12 h-12 text-primary" />,
    color: "from-primary/20 to-background"
  },
  {
    title: "Smart Mastery Path.",
    description: "Follow a strictly gated progression. You don't move forward until you prove you're ready.",
    icon: <Brain className="w-12 h-12 text-secondary" />,
    color: "from-secondary/20 to-background"
  },
  {
    title: "Real Exam Simulation.",
    description: "Full-screen, strict timer, instant analysis. Train how you fight.",
    icon: <ShieldCheck className="w-12 h-12 text-warning" />,
    color: "from-warning/20 to-background"
  },
  {
    title: "Instant Video Solutions.",
    description: "Don't stay stuck. Every question comes with text and video breakdowns.",
    icon: <Video className="w-12 h-12 text-accent" />,
    color: "from-accent/20 to-background"
  },
  {
    title: "Distraction-Free Focus.",
    description: "No fluff, no noise. Just you, the material, and your goals.",
    icon: <Target className="w-12 h-12 text-success" />,
    color: "from-success/20 to-background"
  }
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
              <h1 className="text-3xl font-bold text-foreground mb-4 tracking-tight">
                {slides[currentSlide].title}
              </h1>
              <p className="text-muted-foreground text-lg leading-relaxed">
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
