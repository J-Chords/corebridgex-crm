"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FolderKanban, ListChecks, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { LoginForm } from "@/components/auth/login-form";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const BRAND_POINTS = [
  { icon: FolderKanban, text: "Every client engagement in one Project." },
  { icon: ListChecks, text: "Tasks assigned, tracked, and checked off." },
  { icon: ShieldCheck, text: "The right visibility for every role." },
];

// Mount-time entrance only (no scroll-trigger needed — this is a single-viewport page, nothing
// is ever below the fold). The existing global `prefers-reduced-motion` rule in globals.css
// already forces every animation/transition duration to ~0, so no extra guard is needed here.
const ENTRANCE = "animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out fill-mode-both";

function entranceDelay(index: number) {
  return { animationDelay: `${index * 90}ms` };
}

export default function LoginPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/dashboard");
    }
  }, [isLoading, user, router]);

  return (
    <main className="flex min-h-svh flex-col lg:flex-row">
      {/* LEFT — brand panel; collapses away below lg so the form stays the mobile priority. Extra
         bottom padding (vs. none on top) nudges the vertically-centered content block upward,
         so it sits a bit above dead-center rather than pinned to the panel's exact midpoint. */}
      <div className="relative hidden overflow-hidden border-border/80 bg-muted/30 lg:flex lg:w-1/2 lg:flex-col lg:justify-center lg:border-r lg:px-16 lg:pb-28">
        <div
          aria-hidden="true"
          className="absolute -top-24 -left-24 size-96 rounded-full bg-primary/10 blur-3xl dark:bg-primary/15"
        />
        <div
          aria-hidden="true"
          className="absolute -right-16 bottom-0 size-72 rounded-full bg-primary/5 blur-3xl dark:bg-primary/10"
        />
        <div className="relative flex max-w-sm flex-col gap-6">
          <Link
            href="/"
            className={cn("flex items-center gap-2 transition-opacity duration-standard hover:opacity-80", ENTRANCE)}
            style={entranceDelay(0)}
            aria-label="Corebridge X home"
          >
            <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <span className="text-[11px] font-bold">CX</span>
            </span>
            <span className="font-heading text-base font-semibold tracking-tight">Corebridge X</span>
          </Link>
          <Badge
            variant="secondary"
            className={cn("w-fit px-3 py-1 text-[11px] tracking-wide uppercase", ENTRANCE)}
            style={entranceDelay(1)}
          >
            Internal operations platform
          </Badge>
          <h1 className={cn("font-heading text-3xl font-semibold tracking-tight text-balance", ENTRANCE)} style={entranceDelay(2)}>
            Run client services with one clear system.
          </h1>
          <ul className="flex flex-col gap-4">
            {BRAND_POINTS.map(({ icon: Icon, text }, i) => (
              <li
                key={text}
                className={cn("flex items-center gap-3 text-sm text-muted-foreground", ENTRANCE)}
                style={entranceDelay(3 + i)}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground shadow-subtle">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* RIGHT — the sign-in card itself */}
      <div className="relative flex flex-1 flex-col items-center justify-center gap-6 bg-background p-6">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <Link
          href="/"
          className={cn("flex items-center gap-2 transition-opacity duration-standard hover:opacity-80 lg:hidden", ENTRANCE)}
          aria-label="Corebridge X home"
        >
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <span className="text-[11px] font-bold">CX</span>
          </span>
          <span className="font-heading text-base font-semibold tracking-tight">Corebridge X</span>
        </Link>
        <div className={cn("flex w-full justify-center", ENTRANCE)} style={entranceDelay(1)}>
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
