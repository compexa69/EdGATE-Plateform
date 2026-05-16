import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useVerifyEmail, useResendVerification } from "@workspace/api-client-react";
import { Link, useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { MailCheck, RefreshCw, ShieldCheck } from "lucide-react";
import { useState } from "react";

const verifySchema = z.object({
  token: z.string().length(6, "Token must be exactly 6 characters").toUpperCase(),
});

export default function VerifyEmail() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const email = params.get("email") || "";
  const { toast } = useToast();
  const [verified, setVerified] = useState(false);
  const [resentAt, setResentAt] = useState<Date | null>(null);

  const form = useForm<z.infer<typeof verifySchema>>({
    resolver: zodResolver(verifySchema),
    defaultValues: { token: "" },
  });

  const verifyMutation = useVerifyEmail({
    mutation: {
      onSuccess: () => {
        setVerified(true);
        toast({ title: "Email verified!", description: "You can now log in." });
        setTimeout(() => setLocation("/login"), 2500);
      },
      onError: (error) => {
        toast({
          title: "Verification failed",
          description: error.message || "Invalid or expired token. Request a new one.",
          variant: "destructive",
        });
      },
    },
  });

  const resendMutation = useResendVerification({
    mutation: {
      onSuccess: () => {
        setResentAt(new Date());
        toast({ title: "Code resent", description: "Check your inbox for a new verification code." });
      },
      onError: () => {
        toast({ title: "Failed to resend", description: "Please try again shortly.", variant: "destructive" });
      },
    },
  });

  const canResend = !resentAt || Date.now() - resentAt.getTime() > 60_000;

  const onSubmit = (values: z.infer<typeof verifySchema>) => {
    verifyMutation.mutate({ data: { token: values.token } });
  };

  if (verified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-10 pb-10">
            <ShieldCheck className="w-16 h-16 text-success mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Email Verified!</h2>
            <p className="text-muted-foreground">Redirecting you to login…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <MailCheck className="w-12 h-12 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Verify Your Email</CardTitle>
          <CardDescription>
            We sent a 6-character code to{" "}
            {email ? <strong className="text-foreground">{email}</strong> : "your email address"}.
            Enter it below to activate your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="token"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Verification Code</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="A1B2C3"
                        className="text-center text-2xl font-mono tracking-[0.5em] uppercase h-14"
                        maxLength={6}
                        {...field}
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full h-12 text-lg font-semibold"
                disabled={verifyMutation.isPending}
              >
                {verifyMutation.isPending ? "Verifying…" : "Verify Email"}
              </Button>
            </form>
          </Form>

          <div className="mt-6 space-y-4 text-center text-sm text-muted-foreground">
            <p>Didn't receive the code?</p>
            <Button
              variant="outline"
              size="sm"
              disabled={!canResend || !email || resendMutation.isPending}
              onClick={() => resendMutation.mutate({ data: { email } })}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {resendMutation.isPending ? "Sending…" : "Resend Code"}
            </Button>
            {!canResend && <p className="text-xs">You can resend in 60 seconds.</p>}
            <div className="pt-2">
              <Link href="/login" className="text-primary hover:underline">
                Back to Login
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
