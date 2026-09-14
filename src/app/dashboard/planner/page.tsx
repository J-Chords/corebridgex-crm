"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * MVP Simplification Pass (boss feedback) — Planner's Day/Week/Month/scheduled-unscheduled
 * functionality now lives inside My Day itself (Today/Week/Month tabs), and Planner is no longer a
 * separate nav destination. This route stays only as a redirect so an old bookmark/shortcut still
 * lands somewhere sensible rather than 404ing.
 */
export default function PlannerRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/my-day?view=week");
  }, [router]);
  return null;
}
