"use client";

import { useEffect } from "react";
import { trackLessonTime } from "../../actions";

const INTERVAL_SEC = 30;

/** Sends a heartbeat every 30 s while the lesson tab is visible (time-on-lesson tracking). */
export function LessonTimer({ lessonId }: { lessonId: string }) {
  useEffect(() => {
    let visibleSince = document.visibilityState === "visible" ? Date.now() : null;

    const flush = () => {
      if (visibleSince === null) return;
      const secs = Math.round((Date.now() - visibleSince) / 1000);
      visibleSince = document.visibilityState === "visible" ? Date.now() : null;
      if (secs >= 5) void trackLessonTime(lessonId, secs).catch(() => {});
    };

    const timer = window.setInterval(flush, INTERVAL_SEC * 1000);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
      else visibleSince = Date.now();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      flush();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [lessonId]);

  return null;
}
