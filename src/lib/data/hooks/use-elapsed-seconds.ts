"use client";

import { useEffect, useState } from "react";

/**
 * Live-ticking elapsed seconds since `startTime`, updating once a second, plus an optional
 * `baseSeconds` offset — the accumulated time from earlier segments of the same working session
 * (e.g. time already logged before a Pause/Resume), so a resumed timer's display continues counting
 * up rather than restarting from zero. Pass `null`/`undefined` `startTime` to stop the clock.
 */
export function useElapsedSeconds(startTime: string | null | undefined, baseSeconds = 0): number {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!startTime) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setElapsedSeconds(0);
      return;
    }
    const computeElapsed = () =>
      setElapsedSeconds(baseSeconds + Math.max(0, Math.floor((Date.now() - new Date(startTime).getTime()) / 1000)));
    computeElapsed();
    const interval = setInterval(computeElapsed, 1000);
    return () => clearInterval(interval);
  }, [startTime, baseSeconds]);

  return elapsedSeconds;
}
