import { useListUsers, useApproveUser, useSuspendUser, useUpdateUserRole, useResetUserProgress } from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Check, X, RotateCcw } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function AdminUsers() {
  const [filter, setFilter] = useState<string>("all");
  const { data: users, isLoading, refetch } = useListUsers();
  
  const approveMutation = useApproveUser();
  const suspendMutation = useSuspendUser();
  const updateRoleMutation = useUpdateUserRole();
  const resetProgressMutation = useResetUserProgress();
  const { toast } = useToast();

  const handleResetProgress = (userId: string, name: string) => {
    resetProgressMutation.mutate({ userId }, {
      onSuccess: () => {
        toast({ title: "Progress reset", description: `All progress cleared for ${name}.` });
        refetch();
      },
      onError: (error) => {
        toast({
          title: "Reset failed",
          description: (error as any)?.response?.data?.error || "Could not reset progress.",
          variant: "destructive",
        });
      }
    });
  };

  if (isLoading) return <div className="p-8">Loading users...</div>;

  const filteredUsers = users?.filter(u => filter === "all" || u.status === filter);

  const handleApprove = (userId: string) => {
    approveMutation.mutate({ userId }, {
      onSuccess: () => {
        toast({ title: "User approved" });
        refetch();
      }
    });
  };

  const handleSuspend = (userId: string) => {
    suspendMutation.mutate({ userId }, {
      onSuccess: () => {
        toast({ title: "User suspended" });
        refetch();
      }
    });
  };

  const handleRoleChange = (userId: string, role: "student" | "admin") => {
    updateRoleMutation.mutate({ userId, data: { role } }, {
      onSuccess: () => {
        toast({ title: "Role updated" });
        refetch();
      }
    });
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6 pb-24 md:pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground mt-1">Review and manage access.</p>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Users</SelectItem>
            <SelectItem value="pending_approval">Pending Approval</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="border-card-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-4 font-medium">User</th>
                <th className="px-6 py-4 font-medium">Contact</th>
                <th className="px-6 py-4 font-medium">Role</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers?.map((user) => (
                <tr key={user.id} className="border-b border-border hover:bg-muted/20">
                  <td className="px-6 py-4">
                    <div className="font-medium text-foreground">{user.fullName}</div>
                    <div className="text-xs text-muted-foreground mt-1">Joined {new Date(user.createdAt).toLocaleDateString()}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="truncate max-w-[200px]">{user.email}</div>
                    <div className="text-muted-foreground">{user.mobile}</div>
                  </td>
                  <td className="px-6 py-4">
                    <Select 
                      defaultValue={user.role} 
                      onValueChange={(val: "student" | "admin") => handleRoleChange(user.id, val)}
                      disabled={user.role === "super_admin"}
                    >
                      <SelectTrigger className="w-[110px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="student">Student</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant="outline" className={`
                      ${user.status === 'approved' ? 'bg-success/10 text-success border-success/20' : ''}
                      ${user.status === 'pending_approval' ? 'bg-warning/10 text-warning border-warning/20' : ''}
                      ${user.status === 'suspended' ? 'bg-destructive/10 text-destructive border-destructive/20' : ''}
                    `}>
                      {user.status.replace('_', ' ')}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 flex-wrap">
                      {user.status === 'pending_approval' && (
                        <Button size="sm" onClick={() => handleApprove(user.id)} className="bg-success hover:bg-success/90 h-8">
                          <Check className="w-4 h-4 mr-1" /> Approve
                        </Button>
                      )}
                      {user.status === 'approved' && user.role !== 'super_admin' && (
                        <Button size="sm" variant="outline" onClick={() => handleSuspend(user.id)} className="text-warning hover:text-warning hover:bg-warning/10 border-warning/50 h-8">
                          <X className="w-4 h-4 mr-1" /> Suspend
                        </Button>
                      )}
                      {user.status === 'suspended' && (
                        <Button size="sm" variant="outline" onClick={() => handleApprove(user.id)} className="h-8">
                          Restore
                        </Button>
                      )}
                      {user.role !== 'super_admin' && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="outline" className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/50 h-8">
                              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Reset Progress for {user.fullName}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete all topic progress, exam attempts, and results for this user. This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleResetProgress(user.id, user.fullName)}
                                className="bg-destructive hover:bg-destructive/90"
                              >
                                Reset Progress
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsers?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                    No users found matching the current filter.
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
