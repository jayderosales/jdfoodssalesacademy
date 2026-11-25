import { manilaToday } from "@/lib/utils";

/**
 * Practice streak: consecutive Manila calendar days with any learning activity, ending today
 * (or yesterday, so the streak isn't "lost" before the rep has had a chance to practice today).
 */
export function practiceStreak(activityTimestamps: (string | null | undefined)[], now = new Date()): number {
  const days = new Set(activityTimestamps.filter((t): t is string => !!t).map((t) => manilaToday(new Date(t))));
  const dayString = (offset: number) => manilaToday(new Date(now.getTime() - offset * 86_400_000));
  let offset = days.has(dayString(0)) ? 0 : days.has(dayString(1)) ? 1 : -1;
  if (offset < 0) return 0;
  let streak = 0;
  while (days.has(dayString(offset))) {
    streak++;
    offset++;
  }
  return streak;
}

/** Lowest-scoring roleplay skill (ties → rubric order). */
export function weakestSkill(averages: Record<string, number | null>, order: readonly string[]): string | null {
  let best: string | null = null;
  for (const k of order) {
    const v = averages[k];
    if (v == null) continue;
    if (best == null || v < (averages[best] as number)) best = k;
  }
  return best;
}
