"use client";

import { useNotificationPreferences } from "@/lib/data/hooks/use-notification-preferences";
import { ALL_NOTIFICATION_TYPES, NOTIFICATION_TYPE_DESCRIPTIONS, NOTIFICATION_TYPE_LABELS } from "@/lib/data/notification-labels";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

export function NotificationsSection() {
  const { preferences, setPreference } = useNotificationPreferences();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>
          Choose which notifications show up in your feed and the topbar bell. Saved to this browser only — full
          cross-device sync arrives with the real backend.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col">
        {ALL_NOTIFICATION_TYPES.map((type, i) => (
          <div key={type}>
            {i > 0 && <Separator className="my-3" />}
            <label className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{NOTIFICATION_TYPE_LABELS[type]}</span>
                <span className="text-xs text-muted-foreground">{NOTIFICATION_TYPE_DESCRIPTIONS[type]}</span>
              </div>
              <Switch
                checked={preferences[type]}
                onCheckedChange={(checked) => setPreference(type, checked)}
              />
            </label>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
