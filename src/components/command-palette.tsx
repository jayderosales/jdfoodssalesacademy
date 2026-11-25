"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { NavItem } from "@/lib/nav";
import { searchDirectory, type SearchHit } from "@/app/(app)/search-actions";
import { cn } from "@/lib/utils";

/** Ctrl/Cmd+K: jump to any page you can open, or find a person. */
export function CommandPalette({ items }: { items: NavItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setHits([]);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => startTransition(async () => setHits(await searchDirectory(term))), 200);
    return () => clearTimeout(t);
  }, [q]);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    const pages = items
      .filter((i, idx, arr) => arr.findIndex((x) => x.href === i.href) === idx)
      .filter((i) => !term || i.label.toLowerCase().includes(term))
      .map((i) => ({ href: i.href, label: i.label, hint: "Page" }));
    return [...pages, ...hits.map((h) => ({ href: h.href, label: h.label, hint: h.hint }))];
  }, [items, q, hits]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
        aria-label="Search (Ctrl+K)"
      >
        <Search className="size-4" aria-hidden />
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden rounded border px-1 text-[10px] sm:inline">Ctrl K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[10vh]" onClick={() => setOpen(false)}>
          <div role="dialog" aria-label="Search" className="w-full max-w-lg overflow-hidden rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, results.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter" && results[active]) {
                  go(results[active].href);
                }
              }}
              placeholder="Go to a page or find a person…"
              className="w-full border-b bg-transparent px-4 py-3 text-sm outline-none"
              aria-label="Search"
            />
            <ul className="max-h-80 overflow-y-auto py-1" role="listbox">
              {results.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">Nothing found.</li>}
              {results.map((r, i) => (
                <li key={r.href + r.label} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(r.href)}
                    className={cn("flex w-full items-center justify-between px-4 py-2 text-left text-sm", i === active && "bg-muted")}
                  >
                    <span>{r.label}</span>
                    <span className="text-xs text-muted-foreground">{r.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
