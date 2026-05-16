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
    }
  } catch (err) {
    logger.error({ err, to, subject }, "Error sending email");
  }
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const html = `
    <h2>Verify your email</h2>
    <p>Use this token to verify your email address:</p>
    <h3 style="letter-spacing:4px;font-family:monospace">${token}</h3>
    <p>This token expires in 24 hours.</p>
  `;
  await sendEmail(to, "Verify your email - EdTech Study Platform", html);
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const html = `
    <h2>Reset your password</h2>
    <p>Use this token to reset your password:</p>
    <h3 style="letter-spacing:4px;font-family:monospace">${token}</h3>
    <p>This token expires in 1 hour.</p>
  `;
  await sendEmail(to, "Reset your password - EdTech Study Platform", html);
}

export async function sendApprovalEmail(to: string, name: string): Promise<void> {
  const html = `
    <h2>Account Approved</h2>
    <p>Hi ${name},</p>
    <p>Your account has been approved. You can now log in and start studying.</p>
  `;
  await sendEmail(to, "Account Approved - EdTech Study Platform", html);
}
