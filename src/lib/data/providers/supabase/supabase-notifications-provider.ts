import type { NotificationsProvider } from "../notifications-provider";
import type { AppNotification } from "../../types";
import { createClient } from "@/lib/supabase/client";

/**
 * Real Supabase Notifications provider (Phase 7). `notifications` has no INSERT grant for
 * `authenticated` at all — every row is written by a task/checklist RPC (20260814090002_tasks.sql).
 * Reads are self-scoped by RLS (`recipient_id = auth.uid()`); `read` is the only column
 * `authenticated` may UPDATE, so `markNotificationRead` is a plain scoped `.update()`, while
 * `markAllNotificationsRead` uses the dedicated RPC to flip every unread row in one statement.
 */

interface NotificationRow {
  id: string;
  recipient_id: string;
  type: AppNotification["type"];
  message: string;
  related_task_id: string | null;
  related_report_id: string | null;
  related_client_report_id: string | null;
  read: boolean;
  created_at: string;
}

function toNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    recipientId: row.recipient_id,
    type: row.type,
    message: row.message,
    relatedTaskId: row.related_task_id,
    relatedReportId: row.related_report_id,
    relatedClientReportId: row.related_client_report_id,
    read: row.read,
    createdAt: row.created_at,
  };
}

export const supabaseNotificationsProvider: NotificationsProvider = {
  async listNotifications(viewer) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("recipient_id", viewer.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toNotification);
  },

  async markNotificationRead(viewer, notificationId) {
    const supabase = createClient();
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", notificationId)
      .eq("recipient_id", viewer.id);
    if (error) throw new Error(error.message);
  },

  async markAllNotificationsRead() {
    const supabase = createClient();
    const { error } = await supabase.rpc("mark_all_notifications_read");
    if (error) throw new Error(error.message);
  },
};
