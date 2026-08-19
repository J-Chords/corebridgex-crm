/**
 * A Workstream's user-facing identity is now Service-first ("Payroll", not "Payroll 2026") — the
 * `name` field is preserved on the entity/provider for backward/recurrence/template compatibility,
 * but its value is derived from the selected service plus an optional, secondary "reference /
 * qualifier" the user can add (e.g. "Payroll — UK Payroll"). These two functions are the only place
 * that derivation happens, so display and form-prefill can never drift apart.
 */

const QUALIFIER_SEPARATOR = " — ";

/** Builds the stored `name` from a service line's name (if any) and an optional qualifier. */
export function deriveWorkstreamName(serviceLineName: string | null, qualifier: string): string {
  const trimmedQualifier = qualifier.trim();
  if (!serviceLineName) return trimmedQualifier || "Untitled workstream";
  return trimmedQualifier ? `${serviceLineName}${QUALIFIER_SEPARATOR}${trimmedQualifier}` : serviceLineName;
}

/**
 * The inverse — recovers just the qualifier portion from a stored `name`, for prefilling the edit
 * form. Handles three cases: a name produced by `deriveWorkstreamName` with a qualifier (returns the
 * qualifier), one produced with no qualifier (returns ""), and an older/legacy name that doesn't
 * match either pattern (returns the whole name verbatim, so nothing the user typed before this
 * change is ever silently dropped).
 */
export function splitWorkstreamQualifier(name: string, serviceLineName: string | null): string {
  if (!serviceLineName) return name;
  if (name === serviceLineName) return "";
  const prefix = `${serviceLineName}${QUALIFIER_SEPARATOR}`;
  if (name.startsWith(prefix)) return name.slice(prefix.length);
  return name;
}

/**
 * What to actually show as the primary heading wherever a workstream's identity is displayed — the
 * service name takes priority; a workstream with no service line (e.g. Internal Operations) falls
 * back to its raw stored name, completely unaffected by this change.
 */
export function workstreamDisplayHeading(name: string, serviceLineName: string | null): string {
  return serviceLineName ?? name;
}

/**
 * A compact one-line form of an already-derived workstream `name` for tight display contexts (e.g.
 * a Project list's Service column badges) — swaps the heavier " — " qualifier separator for " · "
 * without dropping the qualifier itself (still needed to differentiate same-type services). A no-op
 * when the name has no qualifier.
 */
export function workstreamCompactLabel(name: string): string {
  return name.replace(QUALIFIER_SEPARATOR, " · ");
}
