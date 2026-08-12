"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { isSuperadmin } from "@/lib/data/permissions";
import { SettingsNav, type SettingsSection } from "@/components/settings/settings-nav";
import { ProfileSection } from "@/components/settings/profile-section";
import { AppearanceSection } from "@/components/settings/appearance-section";
import { NotificationsSection } from "@/components/settings/notifications-section";
import { WorkspaceSection } from "@/components/settings/workspace-section";
import { AboutSection } from "@/components/settings/about-section";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";

export default function SettingsPage() {
  const { user } = useAuth();
  const [section, setSection] = useState<SettingsSection>("profile");

  if (!user) return null;

  const showWorkspace = isSuperadmin(user);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your profile, appearance, and notification preferences.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <SettingsNav
          section={section}
          onChange={setSection}
          showWorkspace={showWorkspace}
          className={STAGGER_ITEM_CLASS}
          style={staggerDelay(0)}
        />

        <div key={section} className={STAGGER_ITEM_CLASS} style={staggerDelay(1)}>
          {section === "profile" && <ProfileSection user={user} />}
          {section === "appearance" && <AppearanceSection />}
          {section === "notifications" && <NotificationsSection />}
          {section === "workspace" && showWorkspace && <WorkspaceSection />}
          {section === "about" && <AboutSection />}
        </div>
      </div>
    </div>
  );
}
