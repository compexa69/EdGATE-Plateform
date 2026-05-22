import { logger } from "./logger";

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const FROM_EMAIL = process.env.FROM_EMAIL ?? "onboarding@resend.dev";

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!RESEND_API_KEY) {
    logger.warn({ to, subject }, "RESEND_API_KEY not set, skipping email");
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });
    if (!res.ok) {
      const data = await res.text();
      logger.error({ to, subject, status: res.status, data }, "Failed to send email");
      throw new Error(`Email API error: ${res.status}`);
    }
  } catch (err) {
    logger.error({ err, to, subject }, "Error sending email");
    throw err;
  }
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0F172A;color:#E2E8F0;padding:32px;border-radius:12px">
      <h2 style="color:#6366F1">Verify your email</h2>
      <p>Use this code to verify your email address:</p>
      <h3 style="letter-spacing:8px;font-family:monospace;font-size:28px;color:#E2E8F0;background:#1E293B;padding:16px 24px;border-radius:8px;text-align:center">${token}</h3>
      <p style="color:#94A3B8;font-size:14px">This code expires in 24 hours.</p>
    </div>
  `;
  await sendEmail(to, "Verify your email - EdTech Study Platform", html);
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0F172A;color:#E2E8F0;padding:32px;border-radius:12px">
      <h2 style="color:#6366F1">Reset your password</h2>
      <p>Use this code to reset your password:</p>
      <h3 style="letter-spacing:8px;font-family:monospace;font-size:28px;color:#E2E8F0;background:#1E293B;padding:16px 24px;border-radius:8px;text-align:center">${token}</h3>
      <p style="color:#94A3B8;font-size:14px">This code expires in 1 hour.</p>
    </div>
  `;
  await sendEmail(to, "Reset your password - EdTech Study Platform", html);
}

export async function sendApprovalEmail(to: string, name: string): Promise<void> {
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0F172A;color:#E2E8F0;padding:32px;border-radius:12px">
      <h2 style="color:#6366F1">Account Approved 🎉</h2>
      <p>Hi ${name},</p>
      <p>Your account has been approved. You can now log in and start your study journey.</p>
    </div>
  `;
  await sendEmail(to, "Account Approved - EdTech Study Platform", html);
}

export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0F172A;color:#E2E8F0;padding:32px;border-radius:12px">
      <h1 style="color:#6366F1;font-size:24px;margin-bottom:8px">Welcome to Smart Mastery Path! 🎉</h1>
      <p style="font-size:16px;line-height:1.6;margin-bottom:16px">Hi ${name},</p>
      <p style="font-size:15px;line-height:1.6;color:#CBD5E1;margin-bottom:16px">
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
    </div>
  `;
  await sendEmail(to, "Welcome to EdTech Study Platform — Smart Mastery Path", html);
}

export async function sendStorageAlertEmail(to: string, usedGB: number, limitGB: number): Promise<void> {
  const percentUsed = Math.round((usedGB / limitGB) * 100);
  const html = `
    <h2 style="color:#EF4444">⚠️ B2 Storage Alert</h2>
    <p>Your EdTech platform B2 storage has reached a critical level.</p>
    <table style="border-collapse:collapse;margin:16px 0">
      <tr>
        <td style="padding:4px 12px 4px 0;color:#64748B">Used</td>
        <td style="padding:4px 0;font-weight:bold">${usedGB.toFixed(2)} GB</td>
      </tr>
      <tr>
        <td style="padding:4px 12px 4px 0;color:#64748B">Limit</td>
        <td style="padding:4px 0;font-weight:bold">${limitGB.toFixed(2)} GB</td>
      </tr>
      <tr>
        <td style="padding:4px 12px 4px 0;color:#64748B">Usage</td>
        <td style="padding:4px 0;font-weight:bold;color:#EF4444">${percentUsed}%</td>
      </tr>
    </table>
    <p>Please review stored notes and free up space to ensure continued uploads.</p>
  `;
  await sendEmail(to, `[ACTION REQUIRED] B2 Storage at ${percentUsed}% - EdTech Platform`, html);
}

export async function sendNewQuizEmail(
  to: string,
  name: string,
  examTitle: string,
  examType: string,
): Promise<void> {
  const typeLabels: Record<string, string> = {
    lecture_quiz: "Lecture Quiz",
    dpp: "DPP (Daily Practice Paper)",
    pyq: "PYQ (Previous Year Questions)",
    topic_test: "Topic Test",
    chapter_test: "Chapter Test",
    subject_test: "Subject Test",
    grand_test: "Grand Test",
  };
  const typeLabel = typeLabels[examType] ?? examType;
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0F172A;color:#E2E8F0;padding:32px;border-radius:12px">
      <h2 style="color:#6366F1">New Quiz Available 🚀</h2>
      <p>Hi ${name},</p>
      <p>A new <strong style="color:#E2E8F0">${typeLabel}</strong> has just been added to your study platform:</p>
      <div style="background:#1E293B;border-radius:8px;padding:16px 20px;margin:20px 0;border-left:4px solid #6366F1">
        <p style="margin:0;font-size:18px;font-weight:bold;color:#E2E8F0">${examTitle}</p>
        <p style="margin:8px 0 0;font-size:13px;color:#94A3B8">${typeLabel}</p>
      </div>
      <p>Log in to your dashboard to attempt it and keep your streak going!</p>
      <p style="color:#64748B;font-size:13px;margin-top:24px">Keep pushing — JEE / NEET / GATE success comes one quiz at a time.</p>
    </div>
  `;
  await sendEmail(to, `New Quiz: ${examTitle} — EdTech Study Platform`, html);
}

export async function sendEmailChangeVerification(to: string, newEmail: string, token: string): Promise<void> {
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0F172A;color:#E2E8F0;padding:32px;border-radius:12px">
      <h2 style="color:#6366F1">Confirm Email Change</h2>
      <p>You requested to change your email to <strong>${newEmail}</strong>.</p>
      <p>Use this code to confirm the change:</p>
      <h3 style="letter-spacing:8px;font-family:monospace;font-size:28px;color:#E2E8F0;background:#1E293B;padding:16px 24px;border-radius:8px;text-align:center">${token}</h3>
      <p style="color:#94A3B8;font-size:14px">This code expires in 1 hour. If you did not request this, ignore this email.</p>
    </div>
  `;
  await sendEmail(to, "Confirm your new email - EdTech Study Platform", html);
}
