"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { LandingPage } from "@/components/landing/landing-page";

export default function Home() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/dashboard");
    }
  }, [isLoading, user, router]);

  // CD-226 (UI-1) — an authenticated user still goes straight to the app, unchanged; only the
  // unauthenticated destination changes, from an automatic /login redirect to the public landing
  // page below (Sign In is now a page action, not the default landing spot).
  if (isLoading || user) return null;

  return <LandingPage />;
}
