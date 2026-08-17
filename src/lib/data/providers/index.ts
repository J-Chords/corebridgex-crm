import { usesSupabaseAuth, usesSupabaseCoreData, usesSupabaseData } from "../provider-mode";
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
import { mockProjectsProvider } from "./mock/mock-projects-provider";
import { supabaseProjectsProvider } from "./supabase/supabase-projects-provider";

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
 * - "supabase-core": Phase 7A-C's transitional mode — Companies/Workstreams/Activity Catalog/
 *   Tasks/Time Entries/Notifications become real Supabase (the operational core), while
 *   Notes/Templates/Task Handoffs/Accomplishments Report/Saved Views/Daily Updates/Client
 *   Report stay mock — kept deliberately unchanged by Phase 7D/7E.
 * - "supabase": every provider below is real Supabase. As of Phase 7D/7E, all 7 remaining
 *   `notImplemented` stubs have real implementations, so this mode is now a genuinely complete
 *   real backend — no provider selected here still throws.
 */
export const authProvider = usesSupabaseAuth ? supabaseAuthProvider : mockAuthProvider;
export const companiesProvider = usesSupabaseCoreData ? supabaseCompaniesProvider : mockCompaniesProvider;
export const workstreamsProvider = usesSupabaseCoreData ? supabaseWorkstreamsProvider : mockWorkstreamsProvider;
export const tasksProvider = usesSupabaseCoreData ? supabaseTasksProvider : mockTasksProvider;
export const timeEntriesProvider = usesSupabaseCoreData ? supabaseTimeEntriesProvider : mockTimeEntriesProvider;
export const notesProvider = usesSupabaseData ? supabaseNotesProvider : mockNotesProvider;
export const notificationsProvider = usesSupabaseCoreData
  ? supabaseNotificationsProvider
  : mockNotificationsProvider;
export const templatesProvider = usesSupabaseData ? supabaseTemplatesProvider : mockTemplatesProvider;
export const taskHandoffsProvider = usesSupabaseData ? supabaseTaskHandoffsProvider : mockTaskHandoffsProvider;
export const activityCatalogProvider = usesSupabaseCoreData
  ? supabaseActivityCatalogProvider
  : mockActivityCatalogProvider;
export const accomplishmentsReportProvider = usesSupabaseData
  ? supabaseAccomplishmentsReportProvider
  : mockAccomplishmentsReportProvider;
export const savedViewsProvider = usesSupabaseData ? supabaseSavedViewsProvider : mockSavedViewsProvider;
export const dailyUpdatesProvider = usesSupabaseData ? supabaseDailyUpdatesProvider : mockDailyUpdatesProvider;
export const clientReportProvider = usesSupabaseData ? supabaseClientReportProvider : mockClientReportProvider;
// Phase 8A — new, read-only this slice. Follows the same Phase 7D/7E provider-mode shape: mock
// under supabase-core (unchanged transitional core), real only under full supabase.
export const projectsProvider = usesSupabaseData ? supabaseProjectsProvider : mockProjectsProvider;
