import "server-only";

/**
 * Minimal transactional email via Resend (Phase 1a: new-device alerts). Phase 1b moves all email onto the
 * notification engine. Without RESEND_API_KEY, emails are skipped and logged (local development).
 */
export async function sendEmail(to: string, subject: string, text: string): Promise<{ sent: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    console.info(`[email skipped: RESEND_API_KEY/EMAIL_FROM not set] to=${to} subject=${subject}`);
    return { sent: false, error: "not configured" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text, reply_to: process.env.EMAIL_REPLY_TO || undefined }),
    });
    if (!res.ok) {
      const msg = `Resend ${res.status}: ${(await res.text()).slice(0, 200)}`;
      console.error(msg);
      return { sent: false, error: msg };
    }
    return { sent: true };
  } catch (e) {
    console.error("Email failed", e);
    return { sent: false, error: String(e) };
  }
}
