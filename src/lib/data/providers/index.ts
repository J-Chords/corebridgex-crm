import { usesSupabaseAuth, usesSupabaseData } from "../provider-mode";
import { mockAuthProvider } from "./mock/mock-auth-provider";
import { supabaseAuthProvider } from "./supabase/supabase-auth-provider";
import { mockCompaniesProvider } from "./mock/mock-companies-provider";
import { supabaseCompaniesProvider } from "./supabase/supabase-companies-provider";
import { mockWorkstreamsProvider } from "./mock/mock-workstreams-provider";
import { supabaseWorkstreamsProvider } from "./supabase/supabase-workstreams-provider";
import { mockTasksProvider } from "./mock/mock-tasks-provider";
import { supabaseTasksProvider } from "./supabase/supabase-tasks-provider";
import { mockTimeEntriesProvider } from "./mock/mock-time-entries-provider";
import { supabaseTimeEntriesProvider } from "./supabase/supabase-time-entries-provider";
import { mockNotesProvider } from "./mock/mock-notes-provider";
import { supabaseNotesProvider } from "./supabase/supabase-notes-provider";
import { mockNotificationsProvider } from "./mock/mock-notifications-provider";
import { supabaseNotificationsProvider } from "./supabase/supabase-notifications-provider";
import { mockTemplatesProvider } from "./mock/mock-templates-provider";
import { supabaseTemplatesProvider } from "./supabase/supabase-templates-provider";
import { mockTaskHandoffsProvider } from "./mock/mock-task-handoffs-provider";
import { supabaseTaskHandoffsProvider } from "./supabase/supabase-task-handoffs-provider";
import { mockActivityCatalogProvider } from "./mock/mock-activity-catalog-provider";
import { supabaseActivityCatalogProvider } from "./supabase/supabase-activity-catalog-provider";
import { mockAccomplishmentsReportProvider } from "./mock/mock-accomplishments-report-provider";
import { supabaseAccomplishmentsReportProvider } from "./supabase/supabase-accomplishments-report-provider";
import { mockSavedViewsProvider } from "./mock/mock-saved-views-provider";
import { supabaseSavedViewsProvider } from "./supabase/supabase-saved-views-provider";
import { mockDailyUpdatesProvider } from "./mock/mock-daily-updates-provider";
import { supabaseDailyUpdatesProvider } from "./supabase/supabase-daily-updates-provider";
import { mockClientReportProvider } from "./mock/mock-client-report-provider";
import { supabaseClientReportProvider } from "./supabase/supabase-client-report-provider";

/**
 * Single switch for the whole app's backend, driven by `NEXT_PUBLIC_DATA_PROVIDER` (see
 * `../provider-mode`). Every screen already talks to `authProvider`/`companiesProvider`
 * (and, in later phases, the other providers exported from here), so nothing else needs
 * to change as modes advance.
 *
 * - "mock": every provider below is mock.
 * - "supabase-auth": ONLY `authProvider` becomes real Supabase — a deliberate transitional
 *   mode, since most Supabase business-data providers aren't implemented yet. Every other
 *   provider stays mock.
 * - "supabase": every provider below is real Supabase, same as this file's prior behavior.
 */
export const authProvider = usesSupabaseAuth ? supabaseAuthProvider : mockAuthProvider;
export const companiesProvider = usesSupabaseData ? supabaseCompaniesProvider : mockCompaniesProvider;
export const workstreamsProvider = usesSupabaseData ? supabaseWorkstreamsProvider : mockWorkstreamsProvider;
export const tasksProvider = usesSupabaseData ? supabaseTasksProvider : mockTasksProvider;
export const timeEntriesProvider = usesSupabaseData ? supabaseTimeEntriesProvider : mockTimeEntriesProvider;
export const notesProvider = usesSupabaseData ? supabaseNotesProvider : mockNotesProvider;
export const notificationsProvider = usesSupabaseData ? supabaseNotificationsProvider : mockNotificationsProvider;
export const templatesProvider = usesSupabaseData ? supabaseTemplatesProvider : mockTemplatesProvider;
export const taskHandoffsProvider = usesSupabaseData ? supabaseTaskHandoffsProvider : mockTaskHandoffsProvider;
export const activityCatalogProvider = usesSupabaseData
  ? supabaseActivityCatalogProvider
  : mockActivityCatalogProvider;
export const accomplishmentsReportProvider = usesSupabaseData
  ? supabaseAccomplishmentsReportProvider
  : mockAccomplishmentsReportProvider;
export const savedViewsProvider = usesSupabaseData ? supabaseSavedViewsProvider : mockSavedViewsProvider;
export const dailyUpdatesProvider = usesSupabaseData ? supabaseDailyUpdatesProvider : mockDailyUpdatesProvider;
export const clientReportProvider = usesSupabaseData ? supabaseClientReportProvider : mockClientReportProvider;
