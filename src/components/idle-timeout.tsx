"use client";

import { useEffect, useRef, useState } from "react";
import { idleState, IDLE_STORAGE_KEY } from "@/lib/idle";

/**
 * Signs the user out after `minutes` without activity (any tab). Shows a warning in the last minute.
 * The server also refuses a session whose last activity is too old (see middleware), so this is a convenience.
 */
export function IdleTimeout({ minutes }: { minutes: number }) {
  const limitMs = minutes * 60_000;
  const [warn, setWarn] = useState(false);
  const [left, setLeft] = useState(0);
  const lastWrite = useRef(0);

  useEffect(() => {
    const touch = () => {
      const now = Date.now();
      if (now - lastWrite.current > 5_000) {
        lastWrite.current = now;
        localStorage.setItem(IDLE_STORAGE_KEY, String(now));
      }
    };
    touch();
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));

    const timer = setInterval(() => {
      const last = Number(localStorage.getItem(IDLE_STORAGE_KEY) || Date.now());
      const s = idleState(last, Date.now(), limitMs);
      setWarn(s.warn);
      setLeft(Math.ceil(s.remainingMs / 1000));
      if (s.expired) window.location.href = "/auth/signout?reason=idle";
    }, 1_000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      clearInterval(timer);
    };
  }, [limitMs]);

  if (!warn) return null;
  return (
    <div role="alertdialog" aria-live="assertive" className="fixed inset-x-4 bottom-20 z-50 mx-auto max-w-md rounded-xl border bg-card p-4 shadow-xl md:bottom-6">
      <p className="text-sm font-medium">You&apos;ll be signed out in {left} seconds because you haven&apos;t done anything for a while.</p>
      <button
        type="button"
        className="mt-3 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white"
        onClick={() => localStorage.setItem(IDLE_STORAGE_KEY, String(Date.now()))}
      >
        Stay signed in
      </button>
    </div>
  );
}
