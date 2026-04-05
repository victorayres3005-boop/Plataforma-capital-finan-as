"use client";

import { useState, useEffect, useRef } from "react";

// Spring-like easing: slight overshoot then settle
function springEase(t: number): number {
  // Attempt to reach 1.0 with a slight bounce
  const c4 = (2 * Math.PI) / 4.5;
  return t === 0 ? 0 : t === 1 ? 1
    : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

export function useAnimatedCounter(
  target: number,
  duration = 1200,
  delay = 0,
): number {
  const [value, setValue] = useState(0);
  const prev = useRef(0);
  const started = useRef(false);

  useEffect(() => {
    if (target === prev.current && started.current) return;
    started.current = true;
    const start = prev.current;
    const diff = target - start;
    if (diff === 0) { setValue(target); return; }

    const timeout = setTimeout(() => {
      const startTime = performance.now();

      const step = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = springEase(progress);
        const current = Math.round(start + diff * eased);
        setValue(current);
        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          prev.current = target;
        }
      };

      requestAnimationFrame(step);
    }, delay);

    return () => clearTimeout(timeout);
  }, [target, duration, delay]);

  return value;
}
