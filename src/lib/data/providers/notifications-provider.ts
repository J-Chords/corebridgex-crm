import type { AppNotification, User } from "../types";

/**
 * Contract every provider (mock, Supabase, future AWS) must implement.
 * Notifications are always self-scoped — a viewer only ever sees/mutates
 * their own (recipientId === viewer.id) — so there's no role-based gate
 * to centralize here beyond that ownership check.
 */
export interface NotificationsProvider {
  listNotifications(viewer: User): Promise<AppNotification[]>;
  markNotificationRead(viewer: User, notificationId: string): Promise<void>;
  markAllNotificationsRead(viewer: User): Promise<void>;
}
