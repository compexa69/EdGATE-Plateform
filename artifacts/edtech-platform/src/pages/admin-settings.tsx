import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Settings, Save, RefreshCw, ShieldAlert, History, Download } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { useExportUserData } from "@/hooks/use-profile";

interface ConfigEntry {
  value: string;
  description: string;
}

interface AuditLog {
  id: string;
  actorName: string;
  action: string;
  details: string | null;
  targetId: string | null;
  createdAt: string;
}

async function fetchConfig(): Promise<Record<string, ConfigEntry>> {
  const res = await fetch("/api/admin/config", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load config");
  return res.json();
}

async function saveConfig(updates: Record<string, string>): Promise<void> {
  const res = await fetch("/api/admin/config", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("Failed to save config");
}

async function fetchAuditLogs(): Promise<AuditLog[]> {
  const res = await fetch("/api/admin/audit-logs", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load audit logs");
  return res.json();
}

const CONFIG_LABELS: Record<string, string> = {
  lecture_quiz_passing_score: "Lecture Quiz Passing Score (%)",
  topic_test_passing_score: "Topic Test Passing Score (%)",
  chapter_test_passing_score: "Chapter Test Passing Score (%)",
  max_quiz_attempts: "Max Quiz Attempts",
  max_exam_pauses: "Max Exam Pauses Per Attempt",
  low_ctr_threshold: "Low CTR Flag Threshold (%)",
};

export default function AdminSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const { refetch: fetchExport, isFetching: isExporting } = useExportUserData({
    query: { enabled: false } as any,
  });

  const handleExport = async () => {
    const result = await fetchExport();
    if (result.data) {
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `edtech-export-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export complete", description: "User data downloaded as JSON." });
    } else {
      toast({ title: "Export failed", description: "Could not export data.", variant: "destructive" });
    }
  };

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ["admin-config"],
    queryFn: fetchConfig,
  });

  const { data: auditLogs, isLoading: logsLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: fetchAuditLogs,
  });

  useEffect(() => {
    if (config) {
      const vals: Record<string, string> = {};
      for (const [key, entry] of Object.entries(config)) {
        vals[key] = entry.value;
      }
      setFormValues(vals);
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: saveConfig,
    onSuccess: () => {
      toast({ title: "Settings saved", description: "System configuration updated successfully." });
      queryClient.invalidateQueries({ queryKey: ["admin-config"] });
      queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const handleSave = () => {
    saveMutation.mutate(formValues);
  };

  const actionColor = (action: string) => {
    if (action.includes("suspend") || action.includes("ban")) return "destructive";
    if (action.includes("approve")) return "default";
    if (action.includes("role")) return "secondary";
    return "outline";
  };

  if (configLoading) return <div className="p-8">Loading settings...</div>;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-8 pb-24 md:pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
          <p className="text-muted-foreground mt-1">Configure gate thresholds and platform rules.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={isExporting}
            className="gap-2"
          >
            {isExporting
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Exporting...</>
              : <><Download className="w-4 h-4" /> Export Data</>
            }
          </Button>
          <Settings className="w-8 h-8 text-muted-foreground" />
        </div>
      </div>

      {/* Gate Configuration */}
      <Card className="border-card-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-primary" />
            SRS Gate Configuration
          </CardTitle>
          <CardDescription>
            Adjust the passing thresholds and attempt limits for the SRS progression system.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {config && Object.entries(config).map(([key, entry]) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={key} className="text-sm font-medium">
                  {CONFIG_LABELS[key] ?? key}
                </Label>
                <Input
                  id={key}
                  type="number"
                  min={0}
                  max={key.includes("score") || key.includes("threshold") ? 100 : 99}
                  value={formValues[key] ?? entry.value}
                  onChange={(e) => setFormValues(prev => ({ ...prev, [key]: e.target.value }))}
                  className="bg-background"
                />
                <p className="text-xs text-muted-foreground">{entry.description}</p>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={saveMutation.isPending} className="gap-2">
              {saveMutation.isPending
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving...</>
                : <><Save className="w-4 h-4" /> Save Settings</>
              }
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Audit Logs */}
      <Card className="border-card-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-muted-foreground" />
            Audit Log
          </CardTitle>
          <CardDescription>Recent admin actions on the platform (last 100 entries).</CardDescription>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="text-muted-foreground text-sm py-4">Loading logs...</div>
          ) : !auditLogs || auditLogs.length === 0 ? (
            <div className="text-muted-foreground text-sm py-4 text-center">No audit events recorded yet.</div>
          ) : (
            <div className="space-y-2 max-h-[480px] overflow-y-auto">
              {auditLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                  <Badge variant={actionColor(log.action) as any} className="shrink-0 mt-0.5 text-xs capitalize">
                    {log.action.replace(/_/g, " ")}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {log.actorName}
                      {log.details && <span className="font-normal text-muted-foreground"> — {log.details}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(log.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
