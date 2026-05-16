import { useListSubjects, useCreateSubject, useUpdateSubject, useDeleteSubject } from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash, BookOpen, Layers, List } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminSubjects() {
  const { data: subjects, isLoading, refetch } = useListSubjects();
  const createSubject = useCreateSubject();
  const updateSubject = useUpdateSubject();
  const deleteSubject = useDeleteSubject();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newSubject, setNewSubject] = useState({ name: "", description: "" });

  if (isLoading) return <div className="p-8">Loading...</div>;

  const handleCreate = () => {
    createSubject.mutate({ data: { name: newSubject.name, description: newSubject.description, order: 0 } }, {
      onSuccess: () => {
        toast({ title: "Subject created" });
        setIsCreateOpen(false);
        setNewSubject({ name: "", description: "" });
        refetch();
      }
    });
  };

  const handleDelete = (id: string) => {
    deleteSubject.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Subject deleted" });
        refetch();
      }
    });
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6 pb-24 md:pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Content Hierarchy</h1>
          <p className="text-muted-foreground mt-1">Manage subjects, chapters, and topics.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Add Subject</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Subject</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={newSubject.name} onChange={e => setNewSubject({ ...newSubject, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={newSubject.description} onChange={e => setNewSubject({ ...newSubject, description: e.target.value })} />
              </div>
              <Button onClick={handleCreate} disabled={!newSubject.name || createSubject.isPending} className="w-full">
                {createSubject.isPending ? "Creating..." : "Create Subject"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {subjects?.map((subject) => (
          <Card key={subject.id} className="border-card-border">
            <CardHeader className="pb-2 flex flex-row items-start justify-between">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-primary" />
                  {subject.name}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{subject.description}</p>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
                <div className="flex items-center gap-1"><Layers className="w-4 h-4" /> {subject.totalChapters} Chapters</div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1"><Edit className="w-4 h-4 mr-2" /> Edit</Button>
                <Button variant="destructive" size="sm" onClick={() => handleDelete(subject.id)} disabled={deleteSubject.isPending}>
                  <Trash className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {subjects?.length === 0 && (
          <div className="col-span-full p-8 text-center text-muted-foreground bg-muted/20 rounded-lg border border-dashed border-border">
            No subjects found. Create one to get started.
          </div>
        )}
      </div>
    </div>
  );
}
