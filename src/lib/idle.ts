/** Idle sign-out rules, shared by the browser timer and the middleware. */

export const IDLE_STORAGE_KEY = "jdos:last-activity";
/** Cookie holding the last time the server saw a request (ms since epoch). */
export const LAST_SEEN_COOKIE = "jdos_last_seen";
/** Cookie holding the idle limit for this session, in minutes (set at sign-in from settings). */
export const IDLE_LIMIT_COOKIE = "jdos_idle_min";
export const IDLE_WARN_MS = 60_000;

export function idleState(lastActivity: number, now: number, limitMs: number) {
  const remainingMs = Math.max(0, lastActivity + limitMs - now);
  return { expired: remainingMs === 0, warn: remainingMs > 0 && remainingMs <= IDLE_WARN_MS, remainingMs };
}

/** Server-side check: has this session been idle longer than its limit? Missing or bad cookies never expire a session. */
export function serverSessionExpired(lastSeen: string | undefined, limitMinutes: string | undefined, now: number): boolean {
  const last = Number(lastSeen);
  const limit = Number(limitMinutes);
  if (!Number.isFinite(last) || !Number.isFinite(limit) || last <= 0 || limit <= 0) return false;
  return now - last > limit * 60_000;
}
