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
 * Single switch for the whole app's backend. Set NEXT_PUBLIC_DATA_PROVIDER
 * to "supabase" once the real backend is ready — every screen already talks
 * to `authProvider`/`companiesProvider` (and, in later phases, the other
 * providers exported from here), so nothing else needs to change.
 */
const useSupabase = process.env.NEXT_PUBLIC_DATA_PROVIDER === "supabase";

export const authProvider = useSupabase ? supabaseAuthProvider : mockAuthProvider;
export const companiesProvider = useSupabase ? supabaseCompaniesProvider : mockCompaniesProvider;
export const workstreamsProvider = useSupabase ? supabaseWorkstreamsProvider : mockWorkstreamsProvider;
export const tasksProvider = useSupabase ? supabaseTasksProvider : mockTasksProvider;
export const timeEntriesProvider = useSupabase ? supabaseTimeEntriesProvider : mockTimeEntriesProvider;
export const notesProvider = useSupabase ? supabaseNotesProvider : mockNotesProvider;
export const notificationsProvider = useSupabase ? supabaseNotificationsProvider : mockNotificationsProvider;
export const templatesProvider = useSupabase ? supabaseTemplatesProvider : mockTemplatesProvider;
export const taskHandoffsProvider = useSupabase ? supabaseTaskHandoffsProvider : mockTaskHandoffsProvider;
export const activityCatalogProvider = useSupabase ? supabaseActivityCatalogProvider : mockActivityCatalogProvider;
export const accomplishmentsReportProvider = useSupabase
  ? supabaseAccomplishmentsReportProvider
  : mockAccomplishmentsReportProvider;
export const savedViewsProvider = useSupabase ? supabaseSavedViewsProvider : mockSavedViewsProvider;
export const dailyUpdatesProvider = useSupabase ? supabaseDailyUpdatesProvider : mockDailyUpdatesProvider;
export const clientReportProvider = useSupabase ? supabaseClientReportProvider : mockClientReportProvider;
