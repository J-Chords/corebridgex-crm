"use client";

import { useEffect, useState } from "react";

/** Client-only platform sniff for displaying "⌘K" vs "Ctrl K" — defaults to the non-Mac label until mounted, so there's no SSR/client text mismatch. */
export function useIsMac() {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    // One-time client-only platform read, mirroring this codebase's fetch-on-mount precedent.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMac(/Mac|iPod|iPhone|iPad/.test(navigator.platform));
  }, []);

  return isMac;
}
