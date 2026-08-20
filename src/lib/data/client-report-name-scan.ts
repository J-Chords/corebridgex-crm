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
 * The core match, extracted (Phase 9D) so the Weekly Client Report generator can screen a single
 * candidate narrative string *before* it's ever written into a report, not just warn about it after
 * the fact — same rule either way: each full name and each individual name fragment (first/middle/
 * last) as a whole word, case-insensitively; fragments under 3 characters (an initial, "Jo") are
 * skipped to avoid noisy false positives.
 */
export function textMentionsStaffName(text: string, fullName: string): boolean {
  const candidates = [fullName, ...fullName.split(" ").filter(Boolean)];
  return candidates.some((candidate) => {
    if (candidate.length < 3) return false;
    return new RegExp(`\\b${escapeRegExp(candidate)}\\b`, "i").test(text);
  });
}

/**
 * Best-effort catch for a staff name accidentally typed into free-text Details — a warning, never a
 * hard block, since a substring match can't tell a real mention from a false positive; the mandatory
 * edit-before-finalize review is still what actually keeps a client report name-free (see
 * "Client Reports" in product-brief.md).
 */
export function findMentionedStaffNames(departments: ClientReportDepartmentSection[], staff: User[]): string[] {
  const text = allDetailText(departments);
  if (!text.trim()) return [];
  return staff.filter((user) => textMentionsStaffName(text, user.fullName)).map((user) => user.fullName);
}
