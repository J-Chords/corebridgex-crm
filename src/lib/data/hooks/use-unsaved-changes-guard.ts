"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Warns before losing unsaved edits: a native beforeunload prompt covers tab close/refresh,
 * and a capture-phase click listener intercepts in-app link navigation (sidebar, back links)
 * so the caller can offer save/discard/cancel instead of silently losing the draft. Listeners
 * are re-registered whenever `isDirty` changes so they always see the latest value.
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
  const router = useRouter();
  const [blockedHref, setBlockedHref] = useState<string | null>(null);

  useEffect(() => {
    if (!isDirty) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) return;
    function handleClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement).closest?.("a[href]");
      const href = anchor?.getAttribute("href");
      if (!href || !href.startsWith("/") || href.startsWith("//")) return;
      e.preventDefault();
      e.stopPropagation();
      setBlockedHref(href);
    }
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [isDirty]);

  const proceed = useCallback(() => {
    if (blockedHref) router.push(blockedHref);
    setBlockedHref(null);
  }, [blockedHref, router]);

  const cancel = useCallback(() => setBlockedHref(null), []);

  return { blockedHref, proceed, cancel };
}
