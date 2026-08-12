import type { NotificationsProvider } from "../notifications-provider";

const notImplemented = (): never => {
  throw new Error("supabaseNotificationsProvider is not implemented yet — use the mock provider.");
};

/** Real backend slot-in point — same shape as mockNotificationsProvider, no screen changes needed to swap. */
export const supabaseNotificationsProvider: NotificationsProvider = {
  listNotifications: notImplemented,
  markNotificationRead: notImplemented,
  markAllNotificationsRead: notImplemented,
};
