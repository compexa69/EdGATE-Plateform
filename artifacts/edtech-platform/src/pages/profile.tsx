import { useGetProfile, useUpdateProfile, useGetProfileUploadUrl, useChangePassword, useRemoveProfilePhoto } from "@/hooks/use-profile";
import { useState, useRef, useEffect } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, ShieldCheck, Mail, Phone, Calendar, KeyRound, Eye, EyeOff, Trash2, AtSign, AlertTriangle, Bell, BellOff, BellRing } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { isPushSupported } from "@/lib/push-manager";
import { supabase } from "@/lib/supabase";

function NotificationPreferencesCard() {
  const { toast } = useToast();
  const [prefDailyPlan, setPrefDailyPlan] = useState(() => {
    try { return localStorage.getItem("edtech_notif_daily_plan") !== "false"; } catch { return true; }
  });
  const [prefStreak, setPrefStreak] = useState(() => {
    try { return localStorage.getItem("edtech_notif_streak") !== "false"; } catch { return true; }
  });

  useEffect(() => {
    try { localStorage.setItem("edtech_notif_daily_plan", String(prefDailyPlan)); } catch {}
  }, [prefDailyPlan]);

  useEffect(() => {
    try { localStorage.setItem("edtech_notif_streak", String(prefStreak)); } catch {}
  }, [prefStreak]);

  return (
    <Card className="border-card-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <BellRing className="w-5 h-5 text-primary" />
          Notification Preferences
        </CardTitle>
        <CardDescription>Choose which reminders and alerts you receive.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-start justify-between gap-4 p-4 rounded-lg bg-muted/30 border border-border">
          <div className="flex items-start gap-3">
            <BellOff className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Browser Push Notifications</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Not available in this version. In-app notifications are active.
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" disabled className="shrink-0">
            Unavailable
          </Button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Daily Plan Reminders</p>
              <p className="text-xs text-muted-foreground">Morning alert when your daily study plan is generated.</p>
            </div>
            <Switch
              checked={prefDailyPlan}
              onCheckedChange={setPrefDailyPlan}
              aria-label="Daily plan reminders"
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Streak Reminders</p>
              <p className="text-xs text-muted-foreground">Alert before your daily Pomodoro streak is about to break.</p>
            </div>
            <Switch
              checked={prefStreak}
              onCheckedChange={setPrefStreak}
              aria-label="Streak reminders"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

async function compressImage(file: File, maxSidePx = 512, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxSidePx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas unavailable")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Compression failed"))),
        "image/jpeg",
        quality,
      );
    };
    img.onerror = reject;
    img.src = objectUrl;
  });
}

const profileSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  mobile: z.string().regex(/^(\+91)[\s-]?[6-9]\d{9}$/, "Must be a valid Indian mobile number starting with +91").optional().or(z.literal('')),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain at least one uppercase letter")
    .regex(/[a-z]/, "Must contain at least one lowercase letter")
    .regex(/[0-9]/, "Must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Must contain at least one special character"),
  confirmNewPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmNewPassword, {
  message: "Passwords don't match",
  path: ["confirmNewPassword"],
});

function ChangePasswordModal() {
  const [open, setOpen] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const { toast } = useToast();
  const changePasswordMutation = useChangePassword();

  const form = useForm<z.infer<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmNewPassword: "" },
  });

  const onSubmit = (values: z.infer<typeof changePasswordSchema>) => {
    changePasswordMutation.mutate({
      data: { currentPassword: values.currentPassword, newPassword: values.newPassword }
    }, {
      onSuccess: () => {
        toast({ title: "Password changed successfully" });
        form.reset();
        setOpen(false);
      },
      onError: (error) => {
        toast({
          title: "Failed to change password",
          description: (error as any)?.response?.data?.error || error.message || "Please try again.",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-start gap-3 h-11">
          <KeyRound className="w-4 h-4 text-muted-foreground" />
          Change Password
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-primary" />
            Change Password
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 pt-2">
            <FormField control={form.control} name="currentPassword" render={({ field }) => (
              <FormItem>
                <FormLabel>Current Password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input type={showCurrent ? "text" : "password"} placeholder="••••••••" {...field} />
                    <button type="button" className="absolute right-3 top-2.5 text-muted-foreground" onClick={() => setShowCurrent(!showCurrent)}>
                      {showCurrent ? <Eye className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="newPassword" render={({ field }) => (
              <FormItem>
                <FormLabel>New Password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input type={showNew ? "text" : "password"} placeholder="••••••••" {...field} />
                    <button type="button" className="absolute right-3 top-2.5 text-muted-foreground" onClick={() => setShowNew(!showNew)}>
                      {showNew ? <Eye className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </FormControl>
                <p className="text-xs text-muted-foreground">Min 8 chars, uppercase, lowercase, number, special character</p>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="confirmNewPassword" render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm New Password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input type={showConfirm ? "text" : "password"} placeholder="••••••••" {...field} />
                    <button type="button" className="absolute right-3 top-2.5 text-muted-foreground" onClick={() => setShowConfirm(!showConfirm)}>
                      {showConfirm ? <Eye className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={changePasswordMutation.isPending}>
                {changePasswordMutation.isPending ? "Saving…" : "Change Password"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function ChangeEmailModal({ currentEmail }: { currentEmail: string }) {
  const [open, setOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  const handleRequest = async () => {
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      toast({ title: "Enter a valid email address", variant: "destructive" });
      return;
    }
    setIsPending(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw new Error(error.message);
      setSent(true);
      toast({
        title: "Confirmation emails sent",
        description: "Check both your current and new email to confirm the change.",
      });
    } catch (err: any) {
      toast({ title: err.message || "Failed to request email change", variant: "destructive" });
    } finally {
      setIsPending(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setSent(false);
    setNewEmail("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-start gap-3 h-11">
          <AtSign className="w-4 h-4 text-muted-foreground" />
          Change Email
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AtSign className="w-5 h-5 text-primary" /> Change Email Address
          </DialogTitle>
        </DialogHeader>
        {sent ? (
          <div className="space-y-4 pt-2">
            <div className="p-4 rounded-lg bg-success/10 border border-success/20 text-sm text-success">
              <p className="font-semibold">Confirmation emails sent!</p>
              <p className="mt-1 text-xs">Check both <strong>{currentEmail}</strong> and <strong>{newEmail}</strong> and click the confirmation links to complete the change.</p>
            </div>
            <Button className="w-full" onClick={handleClose}>Done</Button>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">Current email: <strong className="text-foreground">{currentEmail}</strong></p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">New Email Address</label>
              <Input
                type="email"
                placeholder="new@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRequest()}
              />
            </div>
            <p className="text-xs text-muted-foreground">Confirmation links will be sent to both your current and new email address.</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={handleClose}>Cancel</Button>
              <Button className="flex-1" onClick={handleRequest} disabled={isPending}>
                {isPending ? "Sending…" : "Send Confirmation"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeleteAccountModal({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [isPending, setIsPending] = useState(false);
  const { toast } = useToast();
  const { logout } = useAuth();
  const [, setLocation] = useLocation();

  const handleDelete = async () => {
    if (confirm !== "DELETE") {
      toast({ title: 'Type "DELETE" to confirm', variant: "destructive" });
      return;
    }
    setIsPending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("users").delete().eq("id", user.id);
      if (error) throw new Error(error.message);
      toast({ title: "Account deleted", description: "Your account has been permanently removed." });
      await supabase.auth.signOut();
      logout();
      setLocation("/login");
    } catch (err: any) {
      toast({ title: err.message || "Failed to delete account", variant: "destructive" });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-start gap-3 h-11 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={isSuperAdmin}
          title={isSuperAdmin ? "Super admins cannot self-delete — transfer ownership first" : undefined}
        >
          <Trash2 className="w-4 h-4" />
          Delete Account
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" /> Delete Account
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive space-y-1">
            <p className="font-semibold">This action is permanent and cannot be undone.</p>
            <ul className="list-disc list-inside text-xs space-y-0.5 text-destructive/80">
              <li>All your progress and exam results will be erased</li>
              <li>Your uploaded notes will be deleted</li>
              <li>You will be immediately logged out</li>
            </ul>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Type <code className="bg-muted px-1 rounded">DELETE</code> to confirm</label>
            <Input
              placeholder="DELETE"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={handleDelete}
              disabled={isPending || confirm !== "DELETE"}
            >
              {isPending ? "Deleting…" : "Delete My Account"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Profile() {
  const { data: profile, isLoading, refetch } = useGetProfile({
    query: { staleTime: 10 * 60 * 1000, refetchOnWindowFocus: true },
  });
  const updateProfileMutation = useUpdateProfile();
  const getUploadUrlMutation = useGetProfileUploadUrl();
  const removePhotoMutation = useRemoveProfilePhoto();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleRemovePhoto = () => {
    removePhotoMutation.mutate(undefined, {
      onSuccess: () => { toast({ title: "Profile photo removed" }); refetch(); },
      onError: (error) => {
        toast({ title: "Failed to remove photo", description: (error as any)?.response?.data?.error || error.message, variant: "destructive" });
      },
    });
  };

  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    values: { fullName: profile?.fullName || "", mobile: profile?.mobile || "" },
  });

  const onSubmit = (values: z.infer<typeof profileSchema>) => {
    updateProfileMutation.mutate({ data: values }, {
      onSuccess: () => { toast({ title: "Profile updated successfully" }); refetch(); },
      onError: (error) => { toast({ title: "Failed to update profile", description: error.message, variant: "destructive" }); }
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast({ title: "Invalid file type", description: "Only JPG, PNG, and WEBP are supported.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please select an image under 10 MB.", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const compressed = await compressImage(file);
      const { uploadUrl, b2Key } = await getUploadUrlMutation.mutateAsync({
        data: { fileName: `profile_${profile.id}.jpg`, fileSizeBytes: compressed.size }
      });
      await fetch(uploadUrl, { method: "PUT", body: compressed, headers: { "Content-Type": "image/jpeg" } });
      const { error } = await supabase
        .from("users")
        .update({ photo_b2_key: b2Key })
        .eq("id", profile.id);
      if (error) throw new Error(error.message);
      toast({ title: "Photo updated successfully" });
      refetch();
    } catch {
      toast({ title: "Upload failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (isLoading) return <div className="p-8">Loading profile…</div>;
  if (!profile) return <div className="p-8 text-destructive">Profile not found</div>;

  const isSuperAdmin = profile.role === "super_admin";

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-8 pb-24 md:pb-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Your Profile</h1>
        <p className="text-muted-foreground mt-1">Manage your account and settings.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1 space-y-6">
          <Card className="border-card-border overflow-hidden">
            <div className="h-24 bg-gradient-to-r from-primary/40 to-accent/40" />
            <CardContent className="pt-0 relative px-6 pb-6 text-center">
              <div className="relative inline-block -mt-12 mb-4 group">
                <Avatar className={`w-24 h-24 border-4 border-background ${profile.emailVerified ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}>
                  <AvatarImage src={profile.photoUrl || ""} />
                  <AvatarFallback className="text-2xl bg-muted text-muted-foreground">{profile.fullName.charAt(0)}</AvatarFallback>
                </Avatar>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
                  disabled={isUploading}
                  title="Change photo"
                >
                  <Camera className="w-4 h-4" />
                </button>
                <input type="file" ref={fileInputRef} onChange={handlePhotoUpload} accept="image/jpeg,image/png,image/webp" className="hidden" />
              </div>
              {isUploading && <p className="text-xs text-muted-foreground mb-2">Uploading…</p>}
              {profile.photoUrl && (
                <button
                  onClick={handleRemovePhoto}
                  disabled={removePhotoMutation.isPending}
                  className="absolute top-0 right-0 w-6 h-6 bg-destructive rounded-full flex items-center justify-center text-destructive-foreground hover:bg-destructive/90 transition-colors shadow-sm"
                  title="Remove photo"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
              <h2 className="text-xl font-bold">{profile.fullName}</h2>
              <div className="text-muted-foreground text-sm mt-1 capitalize">{profile.role.replace('_', ' ')}</div>
              <div className="flex flex-wrap gap-2 justify-center mt-4">
                {profile.emailVerified && (
                  <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                    <ShieldCheck className="w-3 h-3 mr-1" /> Verified
                  </Badge>
                )}
                <Badge variant="outline" className="capitalize">{profile.status.replace('_', ' ')}</Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="border-card-border">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Account Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 text-sm">
                <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="truncate">{profile.email}</span>
                {profile.emailVerified && <ShieldCheck className="w-4 h-4 text-success shrink-0" />}
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                <span>{profile.mobileMasked}</span>
              </div>
              {profile.createdAt && (
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span>Joined {new Date(profile.createdAt).toLocaleDateString()}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-card-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Security</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <ChangePasswordModal />
              <ChangeEmailModal currentEmail={profile.email} />
            </CardContent>
          </Card>

          <Card className="border-card-border border-destructive/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-destructive">Danger Zone</CardTitle>
              <CardDescription>Permanent actions — cannot be undone.</CardDescription>
            </CardHeader>
            <CardContent>
              <DeleteAccountModal isSuperAdmin={isSuperAdmin} />
              {isSuperAdmin && (
                <p className="text-xs text-muted-foreground mt-2">Super admins cannot self-delete. Transfer ownership to another admin first.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2 space-y-6">
          <Card className="border-card-border">
            <CardHeader>
              <CardTitle>Edit Profile</CardTitle>
              <CardDescription>Update your personal information.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField control={form.control} name="fullName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="mobile" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mobile Number</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <p className="text-xs text-muted-foreground">Format: +91 followed by 10 digits</p>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Button type="submit" disabled={updateProfileMutation.isPending}>
                    {updateProfileMutation.isPending ? "Saving…" : "Save Changes"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>

      <NotificationPreferencesCard />
    </div>
  );
}
