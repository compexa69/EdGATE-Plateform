import { useListSubjects } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Lock, BookOpen, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function Subjects() {
  const { data: subjects, isLoading } = useListSubjects();

  if (isLoading) {
    return <div className="p-8">Loading subjects...</div>;
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6 pb-24 md:pb-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Your Subjects</h1>
        <p className="text-muted-foreground mt-1">Mastery requires deep focus. Select a subject to begin.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {subjects?.map((subject) => {
          const isLocked = subject.gateStatus === "locked";
          const isCompleted = subject.gateStatus === "completed";

          return (
            <Link key={subject.id} href={isLocked ? "#" : `/subjects/${subject.id}`}>
              <Card className={`h-full transition-all duration-200 border-card-border ${
                isLocked 
                  ? "opacity-60 grayscale cursor-not-allowed" 
                  : "hover:border-primary/50 hover:shadow-md cursor-pointer hover:-translate-y-1"
              }`}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-xl flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-primary" />
                      {subject.name}
                    </CardTitle>
                    {isLocked && <Lock className="w-5 h-5 text-muted-foreground" />}
                    {isCompleted && <CheckCircle className="w-5 h-5 text-success" />}
                  </div>
                  {subject.description && (
                    <CardDescription className="line-clamp-2 mt-2">
                      {subject.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">{subject.progressPercent}%</span>
                  </div>
                  <Progress value={subject.progressPercent} className="h-2 bg-muted">
                    <div 
                      className="h-full bg-primary transition-all duration-500 ease-in-out" 
                      style={{ width: `${subject.progressPercent}%` }} 
                    />
                  </Progress>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-xs">
                      {subject.completedChapters}/{subject.totalChapters} Chapters
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
