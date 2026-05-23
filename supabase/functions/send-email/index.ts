import { handleCors, json, err } from "../_shared/cors.ts";
import { requireServiceRole } from "../_shared/auth.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "onboarding@resend.dev";

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn("[send-email] RESEND_API_KEY not set, skipping");
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend API ${res.status}: ${text}`);
  }
}

function card(content: string): string {
  return `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0F172A;color:#E2E8F0;padding:32px;border-radius:12px">${content}</div>`;
}

function codeBox(token: string): string {
  return `<h3 style="letter-spacing:8px;font-family:monospace;font-size:28px;color:#E2E8F0;background:#1E293B;padding:16px 24px;border-radius:8px;text-align:center">${token}</h3>`;
}

const emailTemplates: Record<string, (p: Record<string, string>) => { subject: string; html: string }> = {
  verification: ({ token }) => ({
    subject: "Verify your email - EdTech Study Platform",
    html: card(`
      <h2 style="color:#6366F1">Verify your email</h2>
      <p>Use this code to verify your email address:</p>
      ${codeBox(token)}
      <p style="color:#94A3B8;font-size:14px">This code expires in 24 hours.</p>
    `),
  }),

  password_reset: ({ token }) => ({
    subject: "Reset your password - EdTech Study Platform",
    html: card(`
      <h2 style="color:#6366F1">Reset your password</h2>
      <p>Use this code to reset your password:</p>
      ${codeBox(token)}
      <p style="color:#94A3B8;font-size:14px">This code expires in 1 hour.</p>
    `),
  }),

  approval: ({ name }) => ({
    subject: "Account Approved - EdTech Study Platform",
    html: card(`
      <h2 style="color:#6366F1">Account Approved 🎉</h2>
      <p>Hi ${name},</p>
      <p>Your account has been approved. You can now log in and start your study journey.</p>
    `),
  }),

  welcome: ({ name }) => ({
    subject: "Welcome to EdTech Study Platform — Smart Mastery Path",
    html: card(`
      <h1 style="color:#6366F1;font-size:24px;margin-bottom:8px">Welcome to Smart Mastery Path! 🎉</h1>
      <p style="font-size:16px;line-height:1.6">Hi ${name},</p>
      <p style="font-size:15px;line-height:1.6;color:#CBD5E1">
        You're now part of a focused community preparing for JEE, NEET, and GATE with the
        <strong style="color:#E2E8F0">Smart Gated Learning System</strong>.
      </p>
      <div style="background:#1E293B;border-radius:8px;padding:16px;margin-bottom:20px">
        <p style="margin:0 0 8px;font-weight:bold;color:#E2E8F0">Your journey starts here:</p>
        <ul style="margin:0;padding-left:18px;color:#94A3B8;font-size:14px;line-height:2">
          <li>Watch lectures → pass quizzes → unlock the next step</li>
          <li>Complete topic tests to unlock chapter tests</li>
          <li>Use the Pomodoro timer to track focus sessions</li>
          <li>Upload your handwritten notes after passing each chapter</li>
        </ul>
      </div>
      <p style="font-size:14px;color:#64748B;margin-top:24px">
        Your account is pending admin approval. You'll receive an email once approved.
      </p>
    `),
  }),

  storage_alert: ({ usedGB, limitGB }) => {
    const used = parseFloat(usedGB);
    const limit = parseFloat(limitGB);
    const pct = Math.round((used / limit) * 100);
    return {
      subject: `[ACTION REQUIRED] B2 Storage at ${pct}% - EdTech Platform`,
      html: `
        <h2 style="color:#EF4444">⚠️ B2 Storage Alert</h2>
        <p>Your EdTech platform B2 storage has reached a critical level.</p>
        <table style="border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:4px 12px 4px 0;color:#64748B">Used</td><td style="font-weight:bold">${used.toFixed(2)} GB</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64748B">Limit</td><td style="font-weight:bold">${limit.toFixed(2)} GB</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64748B">Usage</td><td style="font-weight:bold;color:#EF4444">${pct}%</td></tr>
        </table>
        <p>Please review stored notes and free up space to ensure continued uploads.</p>
      `,
    };
  },

  new_quiz: ({ name, examTitle, examType }) => {
    const typeLabels: Record<string, string> = {
      lecture_quiz: "Lecture Quiz",
      dpp: "DPP (Daily Practice Paper)",
      pyq: "PYQ (Previous Year Questions)",
      topic_test: "Topic Test",
      chapter_test: "Chapter Test",
      subject_test: "Subject Test",
      grand_test: "Grand Test",
    };
    const label = typeLabels[examType] ?? examType;
    return {
      subject: `New Quiz: ${examTitle} — EdTech Study Platform`,
      html: card(`
        <h2 style="color:#6366F1">New Quiz Available 🚀</h2>
        <p>Hi ${name},</p>
        <p>A new <strong style="color:#E2E8F0">${label}</strong> has just been added:</p>
        <div style="background:#1E293B;border-radius:8px;padding:16px 20px;margin:20px 0;border-left:4px solid #6366F1">
          <p style="margin:0;font-size:18px;font-weight:bold;color:#E2E8F0">${examTitle}</p>
          <p style="margin:8px 0 0;font-size:13px;color:#94A3B8">${label}</p>
        </div>
        <p>Log in to your dashboard to attempt it and keep your streak going!</p>
        <p style="color:#64748B;font-size:13px;margin-top:24px">Keep pushing — JEE / NEET / GATE success comes one quiz at a time.</p>
      `),
    };
  },

  email_change: ({ newEmail, token }) => ({
    subject: "Confirm your new email - EdTech Study Platform",
    html: card(`
      <h2 style="color:#6366F1">Confirm Email Change</h2>
      <p>You requested to change your email to <strong>${newEmail}</strong>.</p>
      <p>Use this code to confirm the change:</p>
      ${codeBox(token)}
      <p style="color:#94A3B8;font-size:14px">This code expires in 1 hour. If you did not request this, ignore this email.</p>
    `),
  }),
};

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") return err("Method not allowed", 405);

  if (!requireServiceRole(req)) return err("Forbidden — service role required", 403);

  let body: { type: string; to: string; params?: Record<string, string> };
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body");
  }

  const { type, to, params = {} } = body;
  if (!type) return err("type is required");
  if (!to) return err("to (recipient email) is required");

  const template = emailTemplates[type];
  if (!template) {
    return err(`Unknown email type: ${type}. Valid: ${Object.keys(emailTemplates).join(", ")}`);
  }

  try {
    const { subject, html } = template(params);
    await sendEmail(to, subject, html);
    return json({ success: true, type, to });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[send-email] error:", message);
    return err(`Failed to send email: ${message}`, 500);
  }
});
