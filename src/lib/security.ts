import "server-only";
import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { sendEmail } from "@/lib/email";
import { IDLE_LIMIT_COOKIE, LAST_SEEN_COOKIE } from "@/lib/idle";
import { siteUrl } from "@/lib/safe-redirect";
import { createAdminClient, serviceKeyMissing } from "@/lib/supabase/server";
import { deviceLabel } from "@/lib/user-agent";

export type LoginMethod = "password" | "magic_link" | "invite" | "mfa" | "signout" | "idle_timeout";

const DEVICE_COOKIE = "jdos_device";
const TWO_YEARS = 60 * 60 * 24 * 365 * 2;

async function requestInfo() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim();
  return { ip, userAgent: (h.get("user-agent") ?? "").slice(0, 300) };
}

/** Random per-browser id kept in an http-only cookie, used to recognise devices. */
async function deviceId(): Promise<string> {
  const jar = await cookies();
  let id = jar.get(DEVICE_COOKIE)?.value;
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    id = randomUUID();
    jar.set(DEVICE_COOKIE, id, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: TWO_YEARS, path: "/" });
  }
  return id;
}

/**
 * Record a sign-in attempt (or sign-out). Uses the service key because failed attempts have no session.
 * Never throws: security logging must not block someone from signing in.
 */
export async function recordLogin(opts: { userId: string | null; email: string; method: LoginMethod; success: boolean; reason?: string }) {
  if (serviceKeyMissing()) return;
  try {
    const { ip, userAgent } = await requestInfo();
    const device = await deviceId();
    await createAdminClient().from("login_events").insert({
      user_id: opts.userId,
      email: opts.email.slice(0, 200),
      method: opts.method,
      success: opts.success,
      reason: (opts.reason ?? "").slice(0, 200),
      ip,
      user_agent: userAgent,
      device_id: device,
    });
  } catch (e) {
    console.error("recordLogin failed", e);
  }
}

/**
 * After a successful sign-in: start the idle clock, remember the device, and email the user if it's a device
 * we haven't seen before (and not their very first one).
 */
export async function afterSignIn(userId: string, email: string) {
  const jar = await cookies();
  const secure = process.env.NODE_ENV === "production";
  jar.set(LAST_SEEN_COOKIE, String(Date.now()), { httpOnly: true, secure, sameSite: "lax", path: "/" });

  if (serviceKeyMissing()) return;
  try {
    const admin = createAdminClient();
    const [{ data: settings }, { data: internal }] = await Promise.all([
      admin.from("app_settings").select("idle_timeout_internal_minutes, idle_timeout_external_minutes").single(),
      admin.rpc("user_is_internal", { uid: userId }),
    ]);
    const minutes = internal ? (settings?.idle_timeout_internal_minutes ?? 30) : (settings?.idle_timeout_external_minutes ?? 10080);
    jar.set(IDLE_LIMIT_COOKIE, String(minutes), { httpOnly: true, secure, sameSite: "lax", path: "/" });

    const { ip, userAgent } = await requestInfo();
    const device = await deviceId();
    const label = deviceLabel(userAgent);
    const { data: known } = await admin.from("user_devices").select("device_id").eq("user_id", userId);
    const isNew = !(known ?? []).some((d: { device_id: string }) => d.device_id === device);
    await admin
      .from("user_devices")
      .upsert({ user_id: userId, device_id: device, label, last_seen: new Date().toISOString(), last_ip: ip }, { onConflict: "user_id,device_id" });

    if (isNew && (known ?? []).length > 0) {
      const when = new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
      await sendEmail(
        email,
        "New sign-in to JD Foods OS",
        `Someone signed in to your JD Foods OS account from a new device.\n\nDevice: ${label}\nWhen: ${when} (Manila time)\nIP address: ${ip || "unknown"}\n\nIf this was you, you can ignore this email.\nIf it wasn't you, change your password now at ${siteUrl()}/account and tell your administrator.`,
      );
    }
  } catch (e) {
    console.error("afterSignIn failed", e);
  }
}
