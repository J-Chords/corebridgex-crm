"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface HelpDialogContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const HelpDialogContext = createContext<HelpDialogContextValue | null>(null);

/** Mounted once in `dashboard/layout.tsx` — the shared open/close state behind both the sidebar's "Help" entry and the global "?" shortcut, which live in different branches of the tree. Same shape as CommandPaletteProvider. */
export function HelpDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen }), [open]);

  return <HelpDialogContext.Provider value={value}>{children}</HelpDialogContext.Provider>;
}

export function useHelpDialog() {
  const ctx = useContext(HelpDialogContext);
  if (!ctx) throw new Error("useHelpDialog must be used within HelpDialogProvider");
  return ctx;
}
