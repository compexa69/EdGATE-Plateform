import { useGetProfile, useUpdateProfile, useGetProfileUploadUrl, useChangePassword } from "@workspace/api-client-react";
import { useState, useRef } from "react";
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
import { Camera, ShieldCheck, Mail, Phone, Calendar, KeyRound, Eye, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input type={showCurrent ? "text" : "password"} placeholder="••••••••" {...field} />
                      <button type="button" className="absolute right-3 top-2.5 text-muted-foreground" onClick={() => setShowCurrent(!showCurrent)}>
                        {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input type={showNew ? "text" : "password"} placeholder="••••••••" {...field} />
                      <button type="button" className="absolute right-3 top-2.5 text-muted-foreground" onClick={() => setShowNew(!showNew)}>
                        {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </FormControl>
                  <p className="text-xs text-muted-foreground">Min 8 chars, uppercase, lowercase, number, special character</p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmNewPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm New Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input type={showConfirm ? "text" : "password"} placeholder="••••••••" {...field} />
                      <button type="button" className="absolute right-3 top-2.5 text-muted-foreground" onClick={() => setShowConfirm(!showConfirm)}>
                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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

export default function Profile() {
  const { data: profile, isLoading, refetch } = useGetProfile();
  const updateProfileMutation = useUpdateProfile();
  const getUploadUrlMutation = useGetProfileUploadUrl();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    values: {
      fullName: profile?.fullName || "",
      mobile: profile?.mobile || "",
    },
  });

  const onSubmit = (values: z.infer<typeof profileSchema>) => {
    updateProfileMutation.mutate({ data: values }, {
      onSuccess: () => {
        toast({ title: "Profile updated successfully" });
        refetch();
      },
      onError: (error) => {
        toast({ title: "Failed to update profile", description: error.message, variant: "destructive" });
      }
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File too large", description: "Profile photo must be under 2MB.", variant: "destructive" });
      return;
    }

    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast({ title: "Invalid file type", description: "Only JPG, PNG, and WEBP are supported.", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const { uploadUrl, b2Key } = await getUploadUrlMutation.mutateAsync({
        data: { fileName: `profile_${profile.id}.${file.type.split('/')[1]}`, fileSizeBytes: file.size }
      });

      await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type }
      });

      // Persist b2Key to user profile
      const token = localStorage.getItem("edtech_token");
      await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ photoB2Key: b2Key }),
      });

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
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handlePhotoUpload}
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                />
              </div>
              {isUploading && <p className="text-xs text-muted-foreground mb-2">Uploading…</p>}
              <h2 className="text-xl font-bold">{profile.fullName}</h2>
              <div className="text-muted-foreground text-sm mt-1 capitalize">{profile.role.replace('_', ' ')}</div>

              <div className="flex flex-wrap gap-2 justify-center mt-4">
                {profile.emailVerified && (
                  <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                    <ShieldCheck className="w-3 h-3 mr-1" /> Verified
                  </Badge>
                )}
                <Badge variant="outline" className="capitalize">
                  {profile.status.replace('_', ' ')}
                </Badge>
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
            <CardContent>
              <ChangePasswordModal />
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
                  <FormField
                    control={form.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="mobile"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mobile Number</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">Format: +91 followed by 10 digits</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={updateProfileMutation.isPending}>
                    {updateProfileMutation.isPending ? "Saving…" : "Save Changes"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
