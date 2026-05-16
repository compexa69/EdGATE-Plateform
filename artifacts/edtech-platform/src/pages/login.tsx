import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLogin, useResendVerification } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Eye, EyeOff, MailWarning } from "lucide-react";
import { useState } from "react";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export default function Login() {
  const { login: setAuthToken } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data) => {
        setAuthToken(data.token);
        setLocation("/dashboard");
      },
      onError: (error) => {
        const msg = (error as any)?.response?.data?.error || error.message || "";
        if (msg.toLowerCase().includes("verify")) {
          setUnverifiedEmail(form.getValues("email"));
        }
        toast({
          title: "Login failed",
          description: msg || "Please check your credentials.",
          variant: "destructive",
        });
      },
    },
  });

  const resendMutation = useResendVerification({
    mutation: {
      onSuccess: () => {
        toast({ title: "Verification email sent", description: "Check your inbox for the verification code." });
        setLocation(`/verify-email?email=${encodeURIComponent(unverifiedEmail || "")}`);
      },
      onError: () => {
        toast({ title: "Failed to resend", variant: "destructive" });
      },
    },
  });

  const onSubmit = (values: z.infer<typeof loginSchema>) => {
    setUnverifiedEmail(null);
    loginMutation.mutate({ data: values });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold">Cockpit Login</CardTitle>
          <CardDescription>Enter your credentials to access the mastery path.</CardDescription>
        </CardHeader>
        <CardContent>
          {unverifiedEmail && (
            <div className="mb-6 p-4 rounded-lg border border-warning/30 bg-warning/10 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <MailWarning className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                <div className="text-sm text-foreground">
                  <p className="font-semibold text-warning">Email not verified</p>
                  <p className="text-muted-foreground mt-0.5">
                    Please verify <strong>{unverifiedEmail}</strong> before logging in.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-warning/50 text-warning hover:bg-warning/10 w-full"
                disabled={resendMutation.isPending}
                onClick={() => resendMutation.mutate({ data: { email: unverifiedEmail } })}
              >
                {resendMutation.isPending ? "Sending…" : "Resend Verification Code"}
              </Button>
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="student@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Password</FormLabel>
                      <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                        Forgot Password?
                      </Link>
                    </div>
                    <FormControl>
                      <div className="relative">
                        <Input type={showPassword ? "text" : "password"} placeholder="••••••••" {...field} />
                        <button
                          type="button"
                          className="absolute right-3 top-2.5 text-muted-foreground"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full h-12 text-lg font-semibold" disabled={loginMutation.isPending}>
                {loginMutation.isPending ? "Authenticating…" : "Login"}
              </Button>
              <div className="text-center text-sm text-muted-foreground mt-4 space-y-2">
                <div>
                  Don't have an account?{" "}
                  <Link href="/register" className="text-primary hover:underline">Register here</Link>
                </div>
                <div>
                  Have a verification code?{" "}
                  <Link href="/verify-email" className="text-primary hover:underline">Verify email</Link>
                </div>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
