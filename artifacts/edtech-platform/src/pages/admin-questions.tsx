import { useListQuestions, useCreateQuestion, useDeleteQuestion, useListTopics } from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash, Search, Filter } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export default function AdminQuestions() {
  const { data: questions, isLoading, refetch } = useListQuestions();
  const createQuestion = useCreateQuestion();
  const deleteQuestion = useDeleteQuestion();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newQ, setNewQ] = useState({ 
    text: "", 
    option1: "", option2: "", option3: "", option4: "", 
    correctOption: "0", 
    marks: "4",
    difficulty: "medium" as "easy" | "medium" | "hard"
  });

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
    deleteQuestion.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Question deleted" });
        refetch();
      }
    });
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6 pb-24 md:pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Question Bank</h1>
          <p className="text-muted-foreground mt-1">Manage all test and quiz questions.</p>
        </div>
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
                  className="w-full min-h-[100px] p-3 rounded-md bg-background border border-input text-foreground"
                  value={newQ.text} 
                  onChange={e => setNewQ({ ...newQ, text: e.target.value })} 
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Option 1 (Index 0)</Label>
                  <Input value={newQ.option1} onChange={e => setNewQ({ ...newQ, option1: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Option 2 (Index 1)</Label>
                  <Input value={newQ.option2} onChange={e => setNewQ({ ...newQ, option2: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Option 3 (Index 2)</Label>
                  <Input value={newQ.option3} onChange={e => setNewQ({ ...newQ, option3: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Option 4 (Index 3)</Label>
                  <Input value={newQ.option4} onChange={e => setNewQ({ ...newQ, option4: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Correct Option Index</Label>
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
                  <Input type="number" value={newQ.marks} onChange={e => setNewQ({ ...newQ, marks: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Difficulty</Label>
                  <Select value={newQ.difficulty} onValueChange={(val: any) => setNewQ({ ...newQ, difficulty: val })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={handleCreate} disabled={!newQ.text || createQuestion.isPending} className="w-full mt-4">
                {createQuestion.isPending ? "Adding..." : "Add Question"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-card-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-4 font-medium w-1/2">Question</th>
                <th className="px-6 py-4 font-medium">Difficulty</th>
                <th className="px-6 py-4 font-medium">Marks</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {questions?.map((q) => (
                <tr key={q.id} className="border-b border-border hover:bg-muted/20">
                  <td className="px-6 py-4">
                    <div className="font-medium text-foreground line-clamp-2">{q.text}</div>
                    <div className="text-xs text-muted-foreground mt-1">Topic: {q.topicId || 'Unassigned'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant="outline" className={`
                      ${q.difficulty === 'easy' ? 'bg-success/10 text-success border-success/20' : ''}
                      ${q.difficulty === 'medium' ? 'bg-warning/10 text-warning border-warning/20' : ''}
                      ${q.difficulty === 'hard' ? 'bg-destructive/10 text-destructive border-destructive/20' : ''}
                    `}>
                      {q.difficulty}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">{q.marks}</td>
                  <td className="px-6 py-4 text-right">
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(q.id)} disabled={deleteQuestion.isPending} className="h-8 w-8 p-0">
                      <Trash className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {questions?.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                    No questions found. Add some to get started.
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
