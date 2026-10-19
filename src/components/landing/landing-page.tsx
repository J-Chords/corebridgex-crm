"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Eye,
  FolderKanban,
  LayoutTemplate,
  ListChecks,
  ShieldCheck,
  User,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";
import { cn } from "@/lib/utils";

const WORKFLOW_STEPS = [
  {
    label: "Plan",
    title: "Projects",
    icon: FolderKanban,
    description: "Every client engagement lives in one Project, with scope, staffing, and contract history all in one place.",
  },
  {
    label: "Organize",
    title: "Templates & Activities",
    icon: LayoutTemplate,
    description: "Reusable Templates turn repeatable service work into a standard, consistent starting point.",
  },
  {
    label: "Execute",
    title: "Tasks",
    icon: ListChecks,
    description: "Work breaks down into Tasks with owners, due dates, and checklists, assigned and tracked all the way to done.",
  },
  {
    label: "Track",
    title: "Visibility",
    icon: Eye,
    description: "Every role sees exactly the right picture, from a single assignment up to the full client book.",
  },
] as const;

const ROLE_CARDS = [
  {
    icon: ShieldCheck,
    role: "Admin",
    description: "The complete operational picture, covering every client, every project, and every team in one view.",
  },
  {
    icon: UsersRound,
    role: "Team Lead",
    description: "Lead your team's projects and tasks, with visibility into your team's work alongside your own.",
  },
  {
    icon: User,
    role: "Employee",
    description: "A focused view of your own assigned work that stays organized, prioritized, and easy to act on.",
  },
] as const;

// Entrance timing, shared so staggered groups read as one coordinated motion rather than
// independent animations. `fill-mode-both` holds the pre-animation (opacity-0) state until the
// delay elapses, so staggered items don't flash visible then "restart" — and the existing global
// `prefers-reduced-motion` rule (globals.css) already forces every animation-duration to ~0 for
// any visitor who has that preference set, so nothing further is needed here for that.
const ENTRANCE = "animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out fill-mode-both";

function entranceDelay(index: number) {
  return { animationDelay: `${index * 90}ms` };
}

/**
 * Below-the-fold content (everything past the hero) reveals once scrolled into view, rather than
 * animating at mount like the hero does — otherwise it would already be fully settled by the time
 * a visitor scrolls down to it, making the motion invisible in practice. Fires once per element
 * (observer disconnects on first intersection) — a one-shot reveal, not a repeating scroll toggle,
 * which would read as gimmicky rather than polished. Falls back to immediately revealed if
 * IntersectionObserver isn't available. `prefers-reduced-motion` is already handled globally
 * (globals.css forces every transition/animation duration to ~0), so reduced-motion visitors still
 * get the content, just without the visible motion.
 */
function Reveal({
  children,
  className,
  delayMs = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRevealed(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        "transition-all duration-700 ease-out",
        revealed ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
        className
      )}
      style={{ transitionDelay: revealed ? `${delayMs}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}

function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <span className="text-[11px] font-bold">CX</span>
      </span>
      <span className="font-heading text-base font-semibold tracking-tight">Corebridge X</span>
    </span>
  );
}

function IconTile({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground shadow-subtle transition-colors duration-standard group-hover:border-primary/30 group-hover:bg-primary/10 group-hover:text-primary",
        className
      )}
    >
      <Icon className="size-5" />
    </span>
  );
}

function PublicHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-border/80 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center" aria-label="Corebridge X home">
          <BrandMark />
        </Link>
        <nav aria-label="Page sections" className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <a href="#workflow" className="transition-colors duration-standard hover:text-foreground">
            Workflow
          </a>
          <a href="#roles" className="transition-colors duration-standard hover:text-foreground">
            Roles
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button render={<Link href="/login" />} nativeButton={false}>
            Sign In
          </Button>
        </div>
      </div>
    </header>
  );
}

function HeroVisual() {
  return (
    <div className={cn("relative w-full max-w-md shrink-0", ENTRANCE)} style={entranceDelay(3)}>
      {/* Restrained ambient glow, not a literal gradient fill on content — purely a soft backdrop
         accent so the card reads as sitting in front of something, rather than floating on a flat
         field. Same motif as the login page's brand panel, for a consistent visual signature. */}
      <div
        aria-hidden="true"
        className="absolute -top-10 -right-10 -z-10 size-64 rounded-full bg-primary/10 blur-3xl dark:bg-primary/15"
      />
      <Card className="p-5 shadow-dialog ring-1 ring-foreground/10">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground">Acme Manufacturing Co.</span>
          <Badge variant="success">On Track</Badge>
        </div>
        <div className="mt-4 flex flex-col gap-2.5">
          {[
            { label: "Quarterly Payroll Onboarding", status: "In Progress" as const },
            { label: "Monthly Bookkeeping Close", status: "Not Started" as const },
            { label: "Quarterly Tax Filing", status: "Completed" as const },
          ].map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <IconTile icon={ListChecks} className="size-8 shadow-none" />
                <span className="truncate text-sm text-foreground">{row.label}</span>
              </div>
              <Badge
                variant={row.status === "Completed" ? "success" : row.status === "In Progress" ? "info" : "neutral"}
                className="shrink-0"
              >
                {row.status}
              </Badge>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
          <div className="flex -space-x-2">
            {["JE", "PN", "AC"].map((initials) => (
              <span
                key={initials}
                className="flex size-7 items-center justify-center rounded-full border-2 border-card bg-secondary text-[10px] font-medium text-secondary-foreground"
              >
                {initials}
              </span>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">3 team members staffed</span>
        </div>
      </Card>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Light-mode-focused depth cue: dark mode's own background/card contrast already reads as
         rich on its own (confirmed by Product Owner review), so this wash is tuned faint enough
         that it adds very little there, while giving light mode a visual anchor instead of a flat
         field the hero would otherwise float on. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 h-[32rem] bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,color-mix(in_oklch,var(--primary)_10%,transparent),transparent)] dark:bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,color-mix(in_oklch,var(--primary)_6%,transparent),transparent)]"
      />
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-12 px-6 pt-16 pb-20 lg:flex-row lg:items-center lg:pt-24 lg:pb-28">
        <div className="flex max-w-xl flex-col items-start gap-6 text-left">
          <Badge variant="secondary" className={cn("px-3 py-1 text-[11px] tracking-wide uppercase", ENTRANCE)} style={entranceDelay(0)}>
            Internal operations platform
          </Badge>
          <h1
            className={cn("font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl", ENTRANCE)}
            style={entranceDelay(1)}
          >
            Run client services with <em className="text-primary not-italic">one clear system.</em>
          </h1>
          <p className={cn("text-lg leading-relaxed text-muted-foreground", ENTRANCE)} style={entranceDelay(2)}>
            Corebridge X brings Projects, Templates, Activities, and Tasks together in one place, so your
            team always knows what&rsquo;s being done for every client, and what&rsquo;s next.
          </p>
          <div className={cn("flex items-center gap-3", ENTRANCE)} style={entranceDelay(3)}>
            <Button
              render={<Link href="/login" />}
              nativeButton={false}
              size="lg"
              className="h-11 gap-2 rounded-lg px-6 text-base shadow-subtle transition-shadow duration-standard hover:shadow-floating"
            >
              Sign In
              <ArrowRight className="size-4 transition-transform duration-standard group-hover/button:translate-x-0.5" />
            </Button>
          </div>
        </div>
        <div className="flex w-full justify-center lg:w-auto lg:justify-end">
          <HeroVisual />
        </div>
      </div>
    </section>
  );
}

function WorkflowSection() {
  return (
    <section id="workflow" className="border-t border-border/80 bg-gradient-to-b from-muted/50 to-muted/10 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal className="max-w-xl">
          <span className="text-xs font-medium tracking-wide text-primary uppercase">How it works</span>
          <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight">Plan, organize, execute, track.</h2>
          <p className="mt-3 text-base text-muted-foreground">
            One consistent structure for every client engagement, from the first Project to the last Task.
          </p>
        </Reveal>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {WORKFLOW_STEPS.map((step, i) => (
            <Reveal key={step.title} delayMs={i * 90} className="h-full">
              <Card className="group flex h-full flex-col p-5 shadow-subtle transition-all duration-standard hover:-translate-y-0.5 hover:shadow-floating">
                <IconTile icon={step.icon} />
                <span className="mt-4 block text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {step.label}
                </span>
                <h3 className="mt-1 font-heading text-base font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function RolesSection() {
  return (
    <section id="roles" className="border-t border-border/80 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal className="max-w-xl">
          <span className="text-xs font-medium tracking-wide text-primary uppercase">Built for every role</span>
          <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight">The right picture, for every person.</h2>
          <p className="mt-3 text-base text-muted-foreground">
            Everyone signs in to the same system, and what they see is scoped to how they work.
          </p>
        </Reveal>
        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          {ROLE_CARDS.map((card, i) => (
            <Reveal key={card.role} delayMs={i * 90}>
              <Card className="group p-6 shadow-subtle transition-all duration-standard hover:-translate-y-0.5 hover:shadow-floating">
                <IconTile icon={card.icon} />
                <h3 className="mt-4 font-heading text-base font-semibold">{card.role}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{card.description}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClosingCta() {
  return (
    <section className="relative overflow-hidden border-t border-border/80 bg-gradient-to-b from-muted/50 to-muted/10 py-24">
      {/* Same ambient-glow motif as the hero, anchored to the bottom of this panel instead of the
         top — gives the closing section its own presence rather than reusing the hero's exact
         treatment verbatim. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 -z-10 h-80 bg-[radial-gradient(ellipse_70%_60%_at_50%_100%,color-mix(in_oklch,var(--primary)_10%,transparent),transparent)] dark:bg-[radial-gradient(ellipse_70%_60%_at_50%_100%,color-mix(in_oklch,var(--primary)_6%,transparent),transparent)]"
      />
      <div className="mx-auto max-w-2xl px-6">
        <Reveal>
          <Card className="flex flex-col items-center gap-6 p-10 text-center shadow-dialog ring-1 ring-foreground/10 sm:p-16">
            <span className="flex size-14 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-subtle">
              <span className="text-base font-bold">CX</span>
            </span>
            <div className="flex flex-col gap-3">
              <span className="text-xs font-medium tracking-wide text-primary uppercase">Get started</span>
              <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                One system for every client, project, and task.
              </h2>
              <p className="text-base text-muted-foreground">
                Everything your team needs to run client work is already here. Sign in to pick up where you left off.
              </p>
            </div>
            <Button
              render={<Link href="/login" />}
              nativeButton={false}
              size="lg"
              className="h-11 gap-2 rounded-lg px-6 text-base shadow-subtle transition-shadow duration-standard hover:shadow-floating"
            >
              Sign In
              <ArrowRight className="size-4 transition-transform duration-standard group-hover/button:translate-x-0.5" aria-hidden="true" />
            </Button>
          </Card>
        </Reveal>
      </div>
    </section>
  );
}

function PublicFooter() {
  return (
    <footer className="border-t border-border/80">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-6 py-8 text-sm text-muted-foreground sm:flex-row sm:justify-between">
        <BrandMark className="opacity-80" />
        <span>© {new Date().getFullYear()} Corebridge X. Internal use only.</span>
      </div>
    </footer>
  );
}

export function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <PublicHeader />
      <main className="flex-1">
        <Hero />
        <WorkflowSection />
        <RolesSection />
        <ClosingCta />
      </main>
      <PublicFooter />
    </div>
  );
}
