import "server-only";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { computeAccess, type ModuleLite, type PathAccess } from "./unlock";

export interface TreeLesson {
  id: string;
  sort: number;
  title: string;
  est_minutes: number;
}

export interface TreeModule extends ModuleLite {
  title: string;
  description: string;
  category: string;
  lessons: TreeLesson[];
}

export interface PathTree {
  id: string;
  title: string;
  description: string;
  due_date: string | null;
  modules: TreeModule[];
}

/**
 * Paths a user should follow: their assignments plus the default published path.
 * Uses the service client after the caller has established it may view `userId`.
 */
export async function userPathIds(userId: string): Promise<{ id: string; due_date: string | null }[]> {
  const admin = createAdminClient();
  const [{ data: assigned }, { data: def }] = await Promise.all([
    admin.from("path_assignments").select("path_id, due_date").eq("user_id", userId),
    admin.from("learning_paths").select("id").eq("is_default", true).eq("published", true).limit(1),
  ]);
  const out = new Map<string, string | null>();
  (assigned ?? []).forEach((a: { path_id: string; due_date: string | null }) => out.set(a.path_id, a.due_date));
  (def ?? []).forEach((d: { id: string }) => !out.has(d.id) && out.set(d.id, null));
  return [...out].map(([id, due_date]) => ({ id, due_date }));
}

/** Published modules/lessons of the given paths. */
export async function loadPathTrees(paths: { id: string; due_date: string | null }[]): Promise<PathTree[]> {
  if (!paths.length) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("learning_paths")
    .select("id, title, description, published, modules(id, title, description, category, sort, sequential_unlock, lessons(id, title, sort, est_minutes, published))")
    .in("id", paths.map((p) => p.id))
    .eq("published", true);
  const due = new Map(paths.map((p) => [p.id, p.due_date]));
  type Raw = { id: string; title: string; description: string; modules: (Omit<TreeModule, "lessons"> & { lessons: (TreeLesson & { published: boolean })[] })[] };
  return ((data ?? []) as unknown as Raw[]).map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    due_date: due.get(p.id) ?? null,
    modules: p.modules
      .map((m) => ({
        ...m,
        lessons: m.lessons
          .filter((l) => l.published)
          .map(({ id, sort, title, est_minutes }) => ({ id, sort, title, est_minutes }))
          .sort((a, b) => a.sort - b.sort),
      }))
      .sort((a, b) => a.sort - b.sort),
  }));
}

export async function completedLessonIds(userId: string): Promise<Set<string>> {
  const admin = createAdminClient();
  const { data } = await admin.from("lesson_progress").select("lesson_id").eq("user_id", userId).eq("status", "completed");
  return new Set((data ?? []).map((r: { lesson_id: string }) => r.lesson_id));
}

export interface LearnerState {
  trees: PathTree[];
  access: Map<string, PathAccess>; // by path id
  completed: Set<string>;
}

export async function loadLearnerState(userId: string): Promise<LearnerState> {
  const [paths, completed] = await Promise.all([userPathIds(userId), completedLessonIds(userId)]);
  const trees = await loadPathTrees(paths);
  const access = new Map(trees.map((t) => [t.id, computeAccess(t.modules, completed)]));
  return { trees, access, completed };
}

/** Finds which of the learner's paths contains a module. */
export function pathForModule(state: LearnerState, moduleId: string) {
  return state.trees.find((t) => t.modules.some((m) => m.id === moduleId)) ?? null;
}

export function pathForLesson(state: LearnerState, lessonId: string) {
  return state.trees.find((t) => t.modules.some((m) => m.lessons.some((l) => l.id === lessonId))) ?? null;
}

/** May the current session view this user's learning data? (self, their manager, owner) */
export async function canViewUser(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("can_view_user", { uid: userId });
  return data === true;
}

export async function canManageUser(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("can_manage_user", { uid: userId });
  return data === true;
}
