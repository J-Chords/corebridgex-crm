/**
 * Phase 13B final boss-feedback pass — the operational Project naming cleanup. Every normal client
 * Project's own `name` is generated once, at creation, as `"{companyName} {startYear}-{endYear}"`
 * (see `seed-projects.ts`'s `nameFor`) — genuinely useful for admin/historical disambiguation
 * (Related Projects, Superadmin Company detail) but redundant noise on every ordinary day-to-day
 * operational surface (Task lists, My Day, Planner, headers), where the Company name alone is the
 * real daily identity. This module is the ONE place that decides "is this Project name just the
 * Company name plus a date range" — every operational surface reads `operationalProjectIdentity`
 * instead of re-deriving/regexing that on its own.
 *
 * Only ever a presentation decision: `Project.name` itself, its id, and every historical Project
 * record are completely unchanged in the database — this never renames or hides data, only chooses
 * what to render for the *daily* (not historical/reporting) surface.
 */
export interface OperationalProjectIdentity {
  /** Always the Company name — the stable, primary daily identity. */
  primary: string;
  /** The Project's own name, but ONLY when it says something the Company name doesn't already say
   * (e.g. "Annual Payroll Transformation") — null when it's just the Company name plus a trailing
   * year/date range, so ordinary surfaces don't repeat it. */
  secondary: string | null;
}

/** True when `projectName` is exactly `companyName`, or `companyName` followed by a trailing
 * single year or year range (optionally separated by a hyphen/en dash) — the exact shape
 * `seed-projects.ts`'s own `nameFor` generates for every ordinary annual client Project. */
export function isRedundantProjectLabel(companyName: string, projectName: string): boolean {
  if (projectName === companyName) return true;
  if (!projectName.startsWith(companyName)) return false;
  const remainder = projectName.slice(companyName.length).trim();
  return /^\d{4}(\s*[-–]\s*\d{4})?$/.test(remainder);
}

export function operationalProjectIdentity(companyName: string, projectName: string): OperationalProjectIdentity {
  return {
    primary: companyName,
    secondary: isRedundantProjectLabel(companyName, projectName) ? null : projectName,
  };
}

/** A single Project's own operational label, standalone (no list to check for collisions against —
 * use `operationalProjectPickerLabels` instead when rendering several Projects in the same picker). */
export function operationalProjectLabel(project: { companyName: string; name: string }): string {
  return operationalProjectIdentity(project.companyName, project.name).primary;
}

/**
 * For a picker listing several Projects at once (Task Create/Edit's own Project selector, and any
 * future Project filter) — each Project's plain Company-name label, UNLESS two entries in the SAME
 * list would show an identical primary (a genuine ambiguity: two simultaneously legitimate Projects
 * for one Company). Only those specific colliding entries fall back to their own meaningful
 * secondary label, or their full historical name if no non-redundant secondary exists — a project
 * whose primary is unique in the list is never touched, even if its own name happens to carry a
 * year range. This is the "report ambiguity, don't silently hide it" rule applied automatically:
 * in the current data model every Company has exactly one Project (`seed-projects.ts`'s own 1:1
 * `seedCompanies.map(...)`), so this fallback never actually triggers anywhere in the app today —
 * it exists so a future multi-Project-per-Company Company doesn't silently produce indistinguishable
 * picker rows.
 */
export function operationalProjectPickerLabels<T extends { id: string; companyName: string; name: string }>(
  projects: T[]
): Record<string, string> {
  const identities = projects.map((p) => ({ id: p.id, name: p.name, ...operationalProjectIdentity(p.companyName, p.name) }));
  const primaryCounts = new Map<string, number>();
  for (const i of identities) primaryCounts.set(i.primary, (primaryCounts.get(i.primary) ?? 0) + 1);
  const labels: Record<string, string> = {};
  for (const i of identities) {
    const isAmbiguous = (primaryCounts.get(i.primary) ?? 0) > 1;
    labels[i.id] = isAmbiguous ? (i.secondary ? `${i.primary} — ${i.secondary}` : i.name) : i.primary;
  }
  return labels;
}
