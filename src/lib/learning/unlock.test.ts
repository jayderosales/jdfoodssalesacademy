import { describe, expect, it } from "vitest";
import { computeAccess, quizUnlocked, type ModuleLite } from "./unlock";

const modules: ModuleLite[] = [
  { id: "m2", sort: 2, sequential_unlock: true, lessons: [{ id: "b1", sort: 1 }, { id: "b2", sort: 2 }] },
  { id: "m1", sort: 1, sequential_unlock: true, lessons: [{ id: "a2", sort: 2 }, { id: "a1", sort: 1 }] },
  { id: "m3", sort: 3, sequential_unlock: false, lessons: [{ id: "c1", sort: 1 }, { id: "c2", sort: 2 }] },
];

describe("computeAccess", () => {
  it("opens only the first lesson of the first module for a new hire", () => {
    const a = computeAccess(modules, new Set());
    expect(a.lessons.get("a1")!.locked).toBe(false);
    expect(a.lessons.get("a2")!.locked).toBe(true);
    expect(a.modules.get("m2")!.locked).toBe(true);
    expect(a.lessons.get("b1")!.locked).toBe(true);
  });

  it("opens the next lesson after completing one", () => {
    const a = computeAccess(modules, new Set(["a1"]));
    expect(a.lessons.get("a2")!.locked).toBe(false);
    expect(a.modules.get("m2")!.locked).toBe(true);
  });

  it("opens the next module after finishing the previous one", () => {
    const a = computeAccess(modules, new Set(["a1", "a2"]));
    expect(a.modules.get("m1")!.done).toBe(true);
    expect(a.modules.get("m2")!.locked).toBe(false);
    expect(a.lessons.get("b1")!.locked).toBe(false);
    expect(a.lessons.get("b2")!.locked).toBe(true);
  });

  it("module without sequential unlock is open from the start, all lessons free", () => {
    const a = computeAccess(modules, new Set());
    expect(a.modules.get("m3")!.locked).toBe(false);
    expect(a.lessons.get("c2")!.locked).toBe(false);
  });

  it("links prev/next across modules in order", () => {
    const a = computeAccess(modules, new Set());
    expect(a.lessons.get("a2")!.nextId).toBe("b1");
    expect(a.lessons.get("b1")!.prevId).toBe("a2");
  });

  it("counts progress and detects path completion", () => {
    const all = new Set(["a1", "a2", "b1", "b2", "c1", "c2"]);
    const a = computeAccess(modules, all);
    expect(a.completed).toBe(6);
    expect(a.pathDone).toBe(true);
  });

  it("never re-locks a lesson that is already complete", () => {
    const a = computeAccess(modules, new Set(["b2"]));
    expect(a.lessons.get("b2")!.locked).toBe(false);
  });
});

describe("quizUnlocked", () => {
  it("module quiz opens when module lessons are done", () => {
    expect(quizUnlocked({ kind: "module", module_id: "m1" }, computeAccess(modules, new Set(["a1"]))).open).toBe(false);
    expect(quizUnlocked({ kind: "module", module_id: "m1" }, computeAccess(modules, new Set(["a1", "a2"]))).open).toBe(true);
  });
  it("certification needs the whole path", () => {
    expect(quizUnlocked({ kind: "certification", module_id: null }, computeAccess(modules, new Set(["a1", "a2"]))).open).toBe(false);
  });
});
