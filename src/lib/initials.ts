/**
 * Avatar-fallback initials from a person's `fullName` — first letter of the first word + first
 * letter of the last word (so a middle name doesn't shift the result, e.g. "Jordan Lee Ellis" ->
 * "JE", not "JL"). A single-word name falls back to its own first two characters. Never derived
 * from email/id/role — those aren't a person's name and produce a misleading avatar.
 */
export function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
