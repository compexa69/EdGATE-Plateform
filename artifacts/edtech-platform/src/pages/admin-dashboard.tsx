import { useGetAdminStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, BookOpen, FileQuestion, HardDrive, UserCheck, ListChecks, AlertTriangle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function AdminDashboard() {
  const { data: stats, isLoading } = useGetAdminStats();
  
  if (isLoading) return <div className="p-8">Loading stats...</div>;
  if (!stats) return <div className="p-8 text-destructive">Failed to load admin stats</div>;

  const storagePercent = (stats.storageUsedBytes / stats.storageLimitBytes) * 100;
  const gbUsed = (stats.storageUsedBytes / (1024 * 1024 * 1024)).toFixed(2);
  const gbTotal = (stats.storageLimitBytes / (1024 * 1024 * 1024)).toFixed(2);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 pb-24 md:pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Overview</h1>
          <p className="text-muted-foreground mt-1">Platform statistics and quick actions.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-card-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
            <Users className="w-5 h-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{stats.totalUsers}</div>
            <p className="text-xs text-muted-foreground mt-1">{stats.activeUsers} active</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-card-border border-l-4 border-l-warning">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Approvals</CardTitle>
            <UserCheck className="w-5 h-5 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-warning">{stats.pendingApproval}</div>
            {stats.pendingApproval > 0 && (
              <Link href="/admin/users">
                <Button variant="link" className="p-0 h-auto text-xs mt-1">Review now &rarr;</Button>
              </Link>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-card-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Content Structure</CardTitle>
            <BookOpen className="w-5 h-5 text-secondary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{stats.totalSubjects} <span className="text-lg font-normal text-muted-foreground">Sub</span></div>
            <p className="text-xs text-muted-foreground mt-1">{stats.totalChapters} Ch | {stats.totalTopics} Top</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-card-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Question Bank</CardTitle>
            <FileQuestion className="w-5 h-5 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{stats.totalQuestions}</div>
            <p className="text-xs text-muted-foreground mt-1">{stats.totalExamsAttempted} attempts logged</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="border-card-border bg-card">
          <CardHeader>
            <CardTitle>Quick Links</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link href="/admin/users" className="p-4 border border-border rounded-lg hover:border-primary/50 transition-colors group">
              <Users className="w-8 h-8 text-primary mb-3 group-hover:scale-110 transition-transform" />
              <h3 className="font-semibold text-lg mb-1">User Management</h3>
              <p className="text-sm text-muted-foreground">Approve, suspend, roles</p>
            </Link>
            <Link href="/admin/subjects" className="p-4 border border-border rounded-lg hover:border-primary/50 transition-colors group">
              <BookOpen className="w-8 h-8 text-secondary mb-3 group-hover:scale-110 transition-transform" />
              <h3 className="font-semibold text-lg mb-1">Content Manager</h3>
              <p className="text-sm text-muted-foreground">Subjects, chapters, topics</p>
            </Link>
            <Link href="/admin/questions" className="p-4 border border-border rounded-lg hover:border-primary/50 transition-colors group">
              <FileQuestion className="w-8 h-8 text-accent mb-3 group-hover:scale-110 transition-transform" />
              <h3 className="font-semibold text-lg mb-1">Question Bank</h3>
              <p className="text-sm text-muted-foreground">Add/edit questions, bulk import</p>
            </Link>
            <Link href="/admin/exams" className="p-4 border border-border rounded-lg hover:border-primary/50 transition-colors group">
              <ListChecks className="w-8 h-8 text-primary mb-3 group-hover:scale-110 transition-transform" />
              <h3 className="font-semibold text-lg mb-1">Exam Management</h3>
              <p className="text-sm text-muted-foreground">Create exams, assign questions</p>
            </Link>
          </CardContent>
        </Card>

        <Card className="border-card-border bg-card">
          <CardHeader>
            <CardTitle>System Storage (B2)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <div>
                  <div className="text-3xl font-bold text-foreground">{gbUsed} GB</div>
                  <div className="text-sm text-muted-foreground">used of {gbTotal} GB</div>
                </div>
                <HardDrive className={`w-8 h-8 ${storagePercent > 90 ? 'text-destructive' : 'text-muted-foreground'}`} />
              </div>
              <div className="w-full bg-muted rounded-full h-3">
                <div 
                  className={`h-full rounded-full ${storagePercent > 90 ? 'bg-destructive' : storagePercent > 70 ? 'bg-warning' : 'bg-primary'}`} 
                  style={{ width: `${Math.min(100, storagePercent)}%` }} 
                />
              </div>
              {storagePercent > 90 && (
                <p className="text-sm text-destructive font-medium flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" /> Storage critical. Clear old files.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
