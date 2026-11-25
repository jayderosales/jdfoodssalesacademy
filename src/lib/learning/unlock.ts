/**
 * Unlock rules for a learning path (pure functions, unit-tested).
 *
 * - Modules are ordered by `sort`. A module with `sequential_unlock` opens only when every lesson
 *   in the previous module is complete. The first module is always open.
 * - Inside a module with `sequential_unlock`, a lesson opens only when the lesson before it is complete.
 * - A module quiz opens when all lessons in its module are complete.
 * - The certification exam opens when every module in the path is complete.
 */

export interface LessonLite {
  id: string;
  sort: number;
  title?: string;
}

export interface ModuleLite {
  id: string;
  sort: number;
  sequential_unlock: boolean;
  lessons: LessonLite[];
}

export interface ModuleAccess {
  id: string;
  locked: boolean;
  completed: number;
  total: number;
  done: boolean;
}

export interface LessonAccess {
  id: string;
  moduleId: string;
  locked: boolean;
  completed: boolean;
  prevId: string | null;
  nextId: string | null;
}

export interface PathAccess {
  modules: Map<string, ModuleAccess>;
  lessons: Map<string, LessonAccess>;
  completed: number;
  total: number;
  pathDone: boolean;
}

const bySort = <T extends { sort: number }>(a: T, b: T) => a.sort - b.sort;

export function computeAccess(modules: ModuleLite[], completedLessonIds: Set<string>): PathAccess {
  const ordered = [...modules].sort(bySort).map((m) => ({ ...m, lessons: [...m.lessons].sort(bySort) }));
  const moduleAccess = new Map<string, ModuleAccess>();
  const lessonAccess = new Map<string, LessonAccess>();
  const flat = ordered.flatMap((m) => m.lessons.map((l) => ({ ...l, moduleId: m.id })));

  let prevModuleDone = true;
  let completedTotal = 0;

  ordered.forEach((m, mi) => {
    const completed = m.lessons.filter((l) => completedLessonIds.has(l.id)).length;
    const done = completed === m.lessons.length;
    const locked = mi > 0 && m.sequential_unlock && !prevModuleDone;
    moduleAccess.set(m.id, { id: m.id, locked, completed, total: m.lessons.length, done });
    completedTotal += completed;

    m.lessons.forEach((l, li) => {
      const isDone = completedLessonIds.has(l.id);
      const prevInModule = m.lessons[li - 1];
      const lessonLocked =
        !isDone && (locked || (m.sequential_unlock && prevInModule !== undefined && !completedLessonIds.has(prevInModule.id)));
      const idx = flat.findIndex((f) => f.id === l.id);
      lessonAccess.set(l.id, {
        id: l.id,
        moduleId: m.id,
        locked: lessonLocked,
        completed: isDone,
        prevId: flat[idx - 1]?.id ?? null,
        nextId: flat[idx + 1]?.id ?? null,
      });
    });

    prevModuleDone = done;
  });

  const total = flat.length;
  return { modules: moduleAccess, lessons: lessonAccess, completed: completedTotal, total, pathDone: total > 0 && completedTotal === total };
}

/** Is a quiz open for this rep? */
export function quizUnlocked(
  quiz: { kind: string; module_id: string | null },
  access: PathAccess | null,
): { open: boolean; reason?: string } {
  if (quiz.kind === "certification") {
    if (!access) return { open: false, reason: "Not part of your learning path." };
    return access.pathDone ? { open: true } : { open: false, reason: "Finish every module in the learning path first." };
  }
  if (!quiz.module_id) return { open: true };
  const m = access?.modules.get(quiz.module_id);
  if (!m) return { open: false, reason: "Not part of your learning path." };
  return m.done ? { open: true } : { open: false, reason: `Finish the module's lessons first (${m.completed}/${m.total}).` };
}
