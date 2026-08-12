"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { useCommandPalette } from "@/lib/command-palette-context";
import { useHelpDialog } from "@/lib/help-dialog-context";
import { NAV_SHORTCUTS } from "@/lib/keyboard-shortcuts";
import { ShortcutsHelpDialog } from "@/components/dashboard/shortcuts-help-dialog";

/** How long a leading "g" stays "pending" waiting for its second key before the chord cancels itself. */
const CHORD_TIMEOUT_MS = 1200;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** Base UI's dialog/select/etc. popups only exist in the DOM while open — a reliable "something modal is already up" signal, so shortcuts don't fire behind or into it. */
function isOverlayOpen(): boolean {
  return document.querySelector('[data-slot="dialog-content"], [data-slot="popup"]') !== null;
}

/**
 * App-wide keyboard shortcuts — a convenience layer over navigation/dialogs/buttons that already
 * exist, never a second way to do something the UI can't already do by clicking:
 *   - Ctrl+K / ⌘K opens the command palette — the one shortcut that still fires while typing in a
 *     normal field, same as every other command palette (VSCode, Linear, GitHub).
 *   - "g" then a letter navigates (role-gated, same list `AppSidebar` uses to decide what to show).
 *   - "/" focuses this page's search field, "n" opens its new-task dialog — both via a
 *     `data-shortcut` attribute on the relevant existing element; a no-op page-by-page where neither
 *     exists (querySelector just finds nothing).
 *   - "1"-"5" switch My Day's status buckets (My Day only).
 *   - "?" opens the shortcuts help overlay.
 * Everything except Ctrl+K/⌘K never fires while typing in an input/textarea/select/contenteditable,
 * with a modifier held, on a key-repeat, or while any dialog/popup is already open.
 */
export function KeyboardShortcuts() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { setOpen: setPaletteOpen } = useCommandPalette();
  const { open: helpOpen, setOpen: setHelpOpen } = useHelpDialog();
  const pendingGRef = useRef(false);
  const chordTimeoutRef = useRef<number | null>(null);

  const clearChord = useCallback(() => {
    pendingGRef.current = false;
    if (chordTimeoutRef.current !== null) {
      window.clearTimeout(chordTimeoutRef.current);
      chordTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const currentUser = user;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.repeat) return;

      // Ctrl+K / ⌘K opens the command palette — deliberately checked before the typing-target guard
      // below, since every command palette (VSCode, Linear, GitHub) works from inside a text field too.
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "k") {
        if (isOverlayOpen()) return;
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target) || isOverlayOpen()) return;

      if (pendingGRef.current) {
        const nav = NAV_SHORTCUTS.find((s) => s.key === event.key);
        clearChord();
        if (nav && (!nav.isVisible || nav.isVisible(currentUser))) {
          event.preventDefault();
          router.push(nav.href);
        }
        return;
      }

      if (event.key === "g") {
        pendingGRef.current = true;
        chordTimeoutRef.current = window.setTimeout(clearChord, CHORD_TIMEOUT_MS);
        return;
      }

      if (event.key === "/") {
        const el = document.querySelector<HTMLInputElement>('[data-shortcut="search"]');
        if (el) {
          event.preventDefault();
          el.focus();
        }
        return;
      }

      if (event.key === "n") {
        const el = document.querySelector<HTMLButtonElement>('[data-shortcut="new-task"]');
        if (el) {
          event.preventDefault();
          el.click();
        }
        return;
      }

      if (event.key === "?") {
        event.preventDefault();
        setHelpOpen(true);
        return;
      }

      if (pathname === "/dashboard/my-day" && /^[1-5]$/.test(event.key)) {
        const el = document.querySelector<HTMLButtonElement>(`[data-shortcut="bucket-${event.key}"]`);
        if (el) {
          event.preventDefault();
          el.click();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      clearChord();
    };
  }, [user, router, pathname, clearChord, setPaletteOpen, setHelpOpen]);

  if (!user) return null;

  return <ShortcutsHelpDialog open={helpOpen} onOpenChange={setHelpOpen} user={user} />;
}
