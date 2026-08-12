"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun, Monitor, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  // Avoid rendering theme-dependent state before hydration resolves it — same fix as the topbar's ThemeToggle.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Choose how Corebridge X looks on this device.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
            const isActive = mounted && theme === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                aria-pressed={isActive}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border-[1.5px] p-4 text-sm font-medium transition-all duration-300 ease-spring hover:-translate-y-0.5 hover:shadow-md",
                  isActive ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/40"
                )}
              >
                <span className="relative">
                  <Icon className="size-5" aria-hidden="true" />
                  {isActive && (
                    <Check className="absolute -top-1.5 -right-2 size-3.5 rounded-full bg-primary p-0.5 text-primary-foreground" aria-hidden="true" />
                  )}
                </span>
                {label}
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          &quot;System&quot; follows your OS setting and switches automatically if it changes.
        </p>
      </CardContent>
    </Card>
  );
}
