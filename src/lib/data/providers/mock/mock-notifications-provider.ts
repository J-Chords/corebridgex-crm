import type { NotificationsProvider } from "../notifications-provider";
import { db } from "./mock-db";

export const mockNotificationsProvider: NotificationsProvider = {
  async listNotifications(viewer) {
    return db.notifications
      .filter((n) => n.recipientId === viewer.id)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  },

  async markNotificationRead(viewer, notificationId) {
    db.notifications = db.notifications.map((n) =>
      n.id === notificationId && n.recipientId === viewer.id ? { ...n, read: true } : n
    );
  },

  async markAllNotificationsRead(viewer) {
    db.notifications = db.notifications.map((n) =>
      n.recipientId === viewer.id ? { ...n, read: true } : n
    );
  },
};
