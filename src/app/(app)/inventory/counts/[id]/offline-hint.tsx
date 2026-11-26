"use client";

import { useEffect, useState } from "react";

/**
 * Offline safety for counting in the warehouse: every typed count is kept on the phone (localStorage) as you go,
 * restored if the page reloads, and a banner says when there's no signal. Press "Save counts" once you're back online.
 */
export function OfflineCountHint({ countId }: { countId: string }) {
  const key = `jdos:count:${countId}`;
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);

    const saved: Record<string, string> = JSON.parse(localStorage.getItem(key) || "{}");
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[name^="count:"]'));
    let restored = 0;
    for (const el of inputs) {
      if (saved[el.name] !== undefined && saved[el.name] !== el.defaultValue) {
        el.value = saved[el.name];
        restored++;
      }
    }
    setPending(restored);

    const onInput = (e: Event) => {
      const el = e.target as HTMLInputElement;
      if (!el.name?.startsWith("count:")) return;
      const cur: Record<string, string> = JSON.parse(localStorage.getItem(key) || "{}");
      cur[el.name] = el.value;
      localStorage.setItem(key, JSON.stringify(cur));
      setPending(Object.keys(cur).length);
    };
    const onSubmit = (e: Event) => {
      if ((e.target as HTMLFormElement).querySelector('input[name^="count:"]') && navigator.onLine) {
        // the server confirms; clear the phone copy shortly after a successful submit
        setTimeout(() => {
          localStorage.removeItem(key);
          setPending(0);
        }, 1500);
      }
    };
    document.addEventListener("input", onInput);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      document.removeEventListener("input", onInput);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, [key]);

  if (online && pending === 0) return null;
  return (
    <div role="status" className={`mb-3 rounded-lg border p-3 text-sm ${online ? "border-amber-300 bg-amber-50 text-amber-900" : "border-danger/40 bg-danger/5 text-danger"}`}>
      {online
        ? `${pending} count(s) are saved on this phone but not yet in the system. Press "Save counts".`
        : "No signal. Keep counting: your numbers are saved on this phone and you can press \"Save counts\" when you're back online."}
    </div>
  );
}
