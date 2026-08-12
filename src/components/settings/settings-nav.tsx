import type { CSSProperties } from "react";
import { User, Palette, Bell, Building2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type SettingsSection = "profile" | "appearance" | "notifications" | "workspace" | "about";

const SECTIONS: { id: SettingsSection; label: string; icon: typeof User }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "workspace", label: "Workspace", icon: Building2 },
  { id: "about", label: "About", icon: Info },
];

interface SettingsNavProps {
  section: SettingsSection;
  onChange: (section: SettingsSection) => void;
  showWorkspace: boolean;
  className?: string;
  style?: CSSProperties;
}

/** Side-nav for the Settings page — Workspace only renders for superadmin, filtered here so the page component stays a plain switch over whatever's visible. */
export function SettingsNav({ section, onChange, showWorkspace, className, style }: SettingsNavProps) {
  const items = SECTIONS.filter((s) => s.id !== "workspace" || showWorkspace);

  return (
    <nav className={cn("flex flex-row gap-1 overflow-x-auto lg:flex-col", className)} style={style}>
      {items.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-current={section === id ? "true" : undefined}
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium whitespace-nowrap transition-colors",
            section === id
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          {label}
        </button>
      ))}
    </nav>
  );
}
