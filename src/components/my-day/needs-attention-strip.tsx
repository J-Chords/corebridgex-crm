"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { AlertTriangle, Building2, ChevronDown, Sparkles } from "lucide-react";
import type { User } from "@/lib/data/types";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import type { CompanyWithRelations } from "@/lib/data/providers/companies-provider";
import { projectHrefForCompany } from "@/lib/data/project-display";
import { badgeVariants } from "@/components/ui/badge";
import { ContainedIcon } from "@/components/ui/contained-icon";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

/** Defensive backstop on the *expanded* detail list only — the collapsed chip always shows the true count regardless, which is the whole point of this redesign (compact no matter how many items). */
const MAX_EXPANDED_ITEMS = 8;

type AttentionTone = "danger" | "warning" | "neutral";

const TONE_BADGE_VARIANT: Record<AttentionTone, "destructive" | "warning" | "neutral"> = {
  danger: "destructive",
  warning: "warning",
  neutral: "neutral",
};

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

interface AttentionItem {
  id: string;
  message: string;
  href: string;
}

interface AttentionCategory {
  key: string;
  icon: typeof AlertTriangle;
  tone: AttentionTone;
  /** e.g. "3 at-risk clients" — the whole point: this is all that shows until the chip is clicked. */
  chipLabel: string;
  items: AttentionItem[];
}

function buildAtRiskCategory(
  companies: CompanyWithRelations[],
  projects: { id: string; companyId: string }[]
): AttentionCategory | null {
  const items = companies
    .filter((c) => c.health.status === "at-risk")
    .map((company) => ({
      id: `company-${company.id}`,
      message: `${company.name} — at risk`,
      href: projectHrefForCompany(company.id, projects),
    }));
  if (items.length === 0) return null;
  return {
    key: "at-risk",
    icon: Building2,
    tone: "danger",
    chipLabel: `${items.length} at-risk client${items.length === 1 ? "" : "s"}`,
    items,
  };
}

function buildStaffCategory(teamMembers: User[], teamTasks: TaskWithRelations[]): AttentionCategory | null {
  const today = todayDateString();
  const items = teamMembers
    .map((member) => {
      const memberTasks = teamTasks.filter((t) => t.assignees.some((a) => a.id === member.id));
      const blocked = memberTasks.filter((t) => t.status === "blocked").length;
      const overdue = memberTasks.filter((t) => t.status !== "done" && t.dueDate && t.dueDate < today).length;
      return { member, blocked, overdue, total: blocked + overdue };
    })
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.total - a.total)
    .map((entry) => {
      const parts: string[] = [];
      if (entry.overdue > 0) parts.push(`${entry.overdue} overdue`);
      if (entry.blocked > 0) parts.push(`${entry.blocked} blocked`);
      return { id: `member-${entry.member.id}`, message: `${entry.member.fullName} — ${parts.join(", ")}`, href: "/dashboard/tasks" };
    });
  if (items.length === 0) return null;
  return {
    key: "staff",
    icon: AlertTriangle,
    tone: "warning",
    chipLabel: `${items.length} teammate${items.length === 1 ? "" : "s"} need attention`,
    items,
  };
}

interface NeedsAttentionStripProps {
  teamMembers: User[];
  teamTasks: TaskWithRelations[];
  /** Org-wide-only signal (Superadmin) — omit for Supervisor, whose attention strip has no client-health scope. */
  atRiskCompanies?: CompanyWithRelations[];
  /** Required whenever `atRiskCompanies` is passed — resolves each Company to its own Project
   * workspace (Project Closure — Navigation Correction). */
  projects?: { id: string; companyId: string }[];
  className?: string;
  style?: CSSProperties;
}

/**
 * Compact, scalable heads-up strip for a Supervisor's or Superadmin's My Day — teammates (or org-wide
 * staff) with blocked/overdue work, and (Superadmin only) at-risk clients. Phase 11C removed the
 * legacy Internal/Accomplishments Report "reports to review" category — that report type is no
 * longer part of normal Employee/Supervisor workflow. Phase 11D: Client Report reviewers now locate
 * Drafts via the ordinary Recent Reports Status filter on /dashboard/reports/client (there is no
 * dedicated Review Queue anymore), so this strip never gained a Client Report category either.
 * Collapsed by default to a row of small count chips regardless
 * of how many items are behind each count — clicking a chip expands just that category inline; the
 * individual rows within still link out, same as before. A single slim bar, never a full Card with
 * its own header — this stays a quiet accent on an otherwise personal-focused page, not a second
 * dashboard.
 */
export function NeedsAttentionStrip({
  teamMembers,
  teamTasks,
  atRiskCompanies,
  projects,
  className,
  style,
}: NeedsAttentionStripProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const categories = [
    buildAtRiskCategory(atRiskCompanies ?? [], projects ?? []),
    buildStaffCategory(teamMembers, teamTasks),
  ].filter((c): c is AttentionCategory => c !== null);

  if (categories.length === 0) {
    return (
      <div
        className={cn("flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-sm text-muted-foreground", className)}
        style={style}
      >
        <Sparkles className="size-3.5 text-success" aria-hidden="true" />
        All clear — nothing needs your attention today.
      </div>
    );
  }

  const expanded = categories.find((c) => c.key === expandedKey) ?? null;

  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border bg-muted/20 p-2.5", className)} style={style}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 font-mono text-xs tracking-wider text-muted-foreground uppercase">Attention</span>
        {categories.map((cat, i) => {
          const isOpen = cat.key === expandedKey;
          return (
            <button
              key={cat.key}
              type="button"
              aria-expanded={isOpen}
              onClick={() => setExpandedKey(isOpen ? null : cat.key)}
              className={cn(
                badgeVariants({ variant: TONE_BADGE_VARIANT[cat.tone] }),
                "h-6 cursor-pointer gap-1.5 px-2.5 transition-all duration-150 hover:scale-105",
                isOpen && "ring-2 ring-current/30",
                STAGGER_ITEM_CLASS
              )}
              style={staggerDelay(i)}
            >
              <cat.icon aria-hidden="true" />
              {cat.chipLabel}
              <ChevronDown className={cn("size-3 transition-transform duration-150", isOpen && "rotate-180")} aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {expanded && (
        <div className="flex flex-col border-t pt-1.5 duration-150 animate-in fade-in-0">
          {expanded.items.slice(0, MAX_EXPANDED_ITEMS).map((item, i) => (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "group/row -mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60 hover:no-underline",
                STAGGER_ITEM_CLASS
              )}
              style={staggerDelay(i)}
            >
              <ContainedIcon size="sm" tone={expanded.tone} className="shrink-0">
                <expanded.icon aria-hidden="true" />
              </ContainedIcon>
              <span className="min-w-0 flex-1 truncate text-sm group-hover/row:underline">{item.message}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
