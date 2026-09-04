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
import { mockVisitEntriesProvider } from "./mock/mock-visit-entries-provider";
import { supabaseVisitEntriesProvider } from "./supabase/supabase-visit-entries-provider";
import { mockClientReportSchedulesProvider } from "./mock/mock-client-report-schedules-provider";
import { supabaseClientReportSchedulesProvider } from "./supabase/supabase-client-report-schedules-provider";
import { mockDocumentsProvider } from "./mock/mock-documents-provider";
import { supabaseDocumentsProvider } from "./supabase/supabase-documents-provider";
import { mockAdminUsersProvider } from "./mock/mock-admin-users-provider";
import { supabaseAdminUsersProvider } from "./supabase/supabase-admin-users-provider";
import { mockServiceMembershipProvider } from "./mock/mock-service-membership-provider";
import { supabaseServiceMembershipProvider } from "./supabase/supabase-service-membership-provider";
import { mockProjectCommentsProvider } from "./mock/mock-project-comments-provider";
import { supabaseProjectCommentsProvider } from "./supabase/supabase-project-comments-provider";
import { mockProjectIssuesProvider } from "./mock/mock-project-issues-provider";
import { supabaseProjectIssuesProvider } from "./supabase/supabase-project-issues-provider";
import { mockProjectTemplatesProvider } from "./mock/mock-project-templates-provider";
import { supabaseProjectTemplatesProvider } from "./supabase/supabase-project-templates-provider";

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
// Phase 9F — Daily Visit Hours.
export const visitEntriesProvider = usesSupabaseData ? supabaseVisitEntriesProvider : mockVisitEntriesProvider;
// Phase 9F — recurring Client Report schedules.
export const clientReportSchedulesProvider = usesSupabaseData ? supabaseClientReportSchedulesProvider : mockClientReportSchedulesProvider;
// Phase 14B — Documents & Client File Management foundation. No UI yet (14C/14D); real only under
// full "supabase" mode, matching every other brand-new-feature provider's own precedent (Projects,
// Visit Entries, Client Report Schedules).
export const documentsProvider = usesSupabaseData ? supabaseDocumentsProvider : mockDocumentsProvider;
// Admin Foundation — new brand-new-feature providers, same precedent as Documents: real only under
// full "supabase" mode.
export const adminUsersProvider = usesSupabaseData ? supabaseAdminUsersProvider : mockAdminUsersProvider;
export const serviceMembershipProvider = usesSupabaseData
  ? supabaseServiceMembershipProvider
  : mockServiceMembershipProvider;
// Project Level Stage C — same precedent as Documents/Admin Users: real only under full "supabase".
export const projectCommentsProvider = usesSupabaseData ? supabaseProjectCommentsProvider : mockProjectCommentsProvider;
export const projectIssuesProvider = usesSupabaseData ? supabaseProjectIssuesProvider : mockProjectIssuesProvider;
export const projectTemplatesProvider = usesSupabaseData ? supabaseProjectTemplatesProvider : mockProjectTemplatesProvider;
