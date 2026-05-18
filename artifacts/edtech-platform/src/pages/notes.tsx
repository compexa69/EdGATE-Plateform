import { useState } from "react";
import { useListNotes, useDeleteNote, useGetDownloadUrl } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { FileText, Trash2, Download, FolderOpen, Lock, Eye, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function Notes() {
  const { data: notes, isLoading, refetch } = useListNotes();
  const deleteNote = useDeleteNote();
  const getDownloadUrl = useGetDownloadUrl();
  const { toast } = useToast();
  const [previewState, setPreviewState] = useState<{ url: string; name: string } | null>(null);

  const handleDownload = async (noteId: string, fileName: string) => {
    try {
      const result = await getDownloadUrl.mutateAsync({ data: { noteId } });
      const a = document.createElement("a");
      a.href = result.downloadUrl;
      a.download = fileName;
      a.target = "_blank";
      a.click();
    } catch {
      toast({ title: "Download failed", description: "Could not generate download link.", variant: "destructive" });
    }
  };

  const handlePreview = async (noteId: string, fileName: string) => {
    try {
      const result = await getDownloadUrl.mutateAsync({ data: { noteId } });
      setPreviewState({ url: result.downloadUrl, name: fileName });
    } catch {
      toast({ title: "Preview failed", description: "Could not load the file.", variant: "destructive" });
    }
  };

  const handleDelete = (noteId: string) => {
    deleteNote.mutate({ noteId }, {
      onSuccess: () => {
        toast({ title: "Note deleted", description: "The file has been removed." });
        refetch();
      },
      onError: () => {
        toast({ title: "Delete failed", variant: "destructive" });
      },
    });
  };

  if (isLoading) {
    return <div className="p-8 text-muted-foreground">Loading your notes…</div>;
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-8 pb-24 md:pb-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Notes Vault</h1>
        <p className="text-muted-foreground mt-1">
          Your uploaded study notes — unlocked after completing each chapter.
        </p>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4 flex items-start gap-3">
          <Lock className="w-5 h-5 text-primary mt-0.5 shrink-0" />
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Smart Note Vault</span> — PDF uploads are unlocked after completing
            all topics in a chapter and attempting the Chapter Test. This ensures your notes reinforce genuine mastery.
          </div>
        </CardContent>
      </Card>

      {!notes || notes.length === 0 ? (
        <Card className="border-card-border">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FolderOpen className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">No notes yet</h3>
            <p className="text-muted-foreground max-w-sm">
              Complete a chapter and attempt the Chapter Test to unlock your Notes Upload. Your uploaded PDFs will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {notes.map((note) => (
            <Card key={note.id} className="border-card-border hover:border-primary/30 transition-colors">
              <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="shrink-0 w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-primary" />
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground truncate">{note.fileName}</h3>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {note.chapterName && (
                      <Badge variant="outline" className="text-xs">
                        {note.chapterName}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {Math.round(note.fileSizeBytes / 1024)} KB
                      {" · "}
                      {new Date(note.uploadedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 sm:flex-none"
                    onClick={() => handlePreview(note.id, note.fileName)}
                    disabled={getDownloadUrl.isPending}
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Preview
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 sm:flex-none"
                    onClick={() => handleDownload(note.id, note.fileName)}
                    disabled={getDownloadUrl.isPending}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Note</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to permanently delete <strong>{note.fileName}</strong>? This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive hover:bg-destructive/90"
                          onClick={() => handleDelete(note.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!previewState} onOpenChange={() => setPreviewState(null)}>
        <DialogContent className="max-w-4xl w-full h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-4 border-b border-border flex-row items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold truncate pr-8">
              <FileText className="w-4 h-4 text-primary shrink-0" />
              {previewState?.name}
            </DialogTitle>
          </DialogHeader>
          {previewState && (
            <iframe
              src={previewState.url}
              className="flex-1 w-full border-0 rounded-b-lg"
              title={previewState.name}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
