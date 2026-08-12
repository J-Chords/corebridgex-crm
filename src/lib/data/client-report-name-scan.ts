import type { ClientReportDepartmentSection, User } from "./types";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function allDetailText(departments: ClientReportDepartmentSection[]): string {
  const bits: string[] = [];
  for (const dept of departments) {
    for (const activity of dept.activities) {
      for (const item of activity.lineItems) {
        bits.push(item.details);
      }
    }
  }
  return bits.join("\n");
}

/**
 * Best-effort catch for a staff name accidentally typed into free-text Details — a warning, never a
 * hard block, since a substring match can't tell a real mention from a false positive; the mandatory
 * edit-before-finalize review is still what actually keeps a client report name-free (see
 * "Client Reports" in product-brief.md). Matches each staff member's full name and each individual
 * name fragment (first/middle/last) as a whole word, case-insensitively — fragments under 3
 * characters (an initial, "Jo") are skipped to avoid noisy false positives.
 */
export function findMentionedStaffNames(departments: ClientReportDepartmentSection[], staff: User[]): string[] {
  const text = allDetailText(departments);
  if (!text.trim()) return [];

  const found: string[] = [];
  for (const user of staff) {
    const candidates = [user.fullName, ...user.fullName.split(" ").filter(Boolean)];
    const mentioned = candidates.some((candidate) => {
      if (candidate.length < 3) return false;
      return new RegExp(`\\b${escapeRegExp(candidate)}\\b`, "i").test(text);
    });
    if (mentioned) found.push(user.fullName);
  }
  return found;
}
