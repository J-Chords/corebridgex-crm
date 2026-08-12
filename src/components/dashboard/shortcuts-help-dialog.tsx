import type { ReactNode } from "react";
import type { User } from "@/lib/data/types";
import { NAV_SHORTCUTS, ACTION_SHORTCUTS, MY_DAY_BUCKET_KEYS } from "@/lib/keyboard-shortcuts";
import { useIsMac } from "@/lib/use-is-mac";
import { STATUS_ORDER } from "@/components/my-day/status-bucket-button";
import { TASK_STATUS_SELECT_ITEMS } from "@/components/tasks/task-status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-xs font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}

function ShortcutGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="font-mono text-xs tracking-wider text-muted-foreground uppercase">{label}</span>
      <div className="mt-1.5 flex flex-col divide-y">{children}</div>
    </div>
  );
}

function ShortcutRow({ label, keys }: { label: string; keys: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm">{label}</span>
      <span className="flex items-center gap-1">{keys}</span>
    </div>
  );
}

interface ShortcutsHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
}

/** "?" opens this — a plain reference, grouped by Navigation / Actions / My Day, filtered to whatever this role can actually reach (mirrors `AppSidebar`'s own gates). */
export function ShortcutsHelpDialog({ open, onOpenChange, user }: ShortcutsHelpDialogProps) {
  const visibleNav = NAV_SHORTCUTS.filter((s) => !s.isVisible || s.isVisible(user));
  const isMac = useIsMac();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Press <Kbd>?</Kbd> anytime to bring this back up.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <ShortcutGroup label="Navigation">
            {visibleNav.map((s) => (
              <ShortcutRow
                key={s.href}
                label={s.label}
                keys={
                  <>
                    <Kbd>g</Kbd>
                    <Kbd>{s.key}</Kbd>
                  </>
                }
              />
            ))}
          </ShortcutGroup>

          <ShortcutGroup label="Actions">
            <ShortcutRow
              label="Search"
              keys={
                isMac ? (
                  <Kbd>⌘K</Kbd>
                ) : (
                  <>
                    <Kbd>Ctrl</Kbd>
                    <Kbd>K</Kbd>
                  </>
                )
              }
            />
            {ACTION_SHORTCUTS.map((s) => (
              <ShortcutRow key={s.key} label={s.label} keys={<Kbd>{s.key}</Kbd>} />
            ))}
          </ShortcutGroup>

          <ShortcutGroup label="On My Day">
            {STATUS_ORDER.map((status, i) => (
              <ShortcutRow
                key={status}
                label={TASK_STATUS_SELECT_ITEMS[status]}
                keys={<Kbd>{MY_DAY_BUCKET_KEYS[i]}</Kbd>}
              />
            ))}
          </ShortcutGroup>
        </div>
      </DialogContent>
    </Dialog>
  );
}
