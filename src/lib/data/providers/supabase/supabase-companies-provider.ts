import type { CompaniesProvider, CompanyWithRelations } from "../companies-provider";
import type { Brand, ClientContact, Company, CompanyStatus, ServiceLine, User, Role, WorkstreamStatus, TaskStatus } from "../../types";
import { computeClientHealth } from "../../client-health";
import { createClient } from "@/lib/supabase/client";

/**
 * Real Supabase Companies provider (Phase 7 — Core Operational Supabase Backend). RLS is the
 * actual authorization boundary here (the `companies_select`/`_insert`/`_update` policies from
 * Foundation A already enforce exactly the same visibility `canAccessCompany` does in mock) — this
 * file's own job is purely mapping database rows into the exact `CompanyWithRelations`/`ClientContact`
 * shapes the UI already expects, never re-deriving permission decisions client-side. Fetches are
 * done as flat per-table queries and joined in JS (mirroring the mock's own in-memory join style)
 * rather than relying on fragile Postgrest embed-string syntax, given Companies has two distinct
 * relationships to client_contacts (the reverse FK and primary_contact_id).
 */

interface CompanyRow {
  id: string;
  name: string;
  status: CompanyStatus;
  brand_id: string;
  primary_contact_id: string | null;
  contract_start_date: string | null;
  renewal_date: string | null;
  active: boolean;
  created_at: string;
}

function toCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    brandId: row.brand_id,
    primaryContactId: row.primary_contact_id,
    contractStartDate: row.contract_start_date,
    renewalDate: row.renewal_date,
    active: row.active,
    createdAt: row.created_at,
  };
}

function toContact(row: {
  id: string;
  company_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  is_primary: boolean;
  notes: string | null;
}): ClientContact {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    title: row.title,
    isPrimary: row.is_primary,
    notes: row.notes,
  };
}

async function hydrateCompanies(companies: Company[]): Promise<CompanyWithRelations[]> {
  if (companies.length === 0) return [];
  const supabase = createClient();
  const companyIds = companies.map((c) => c.id);
  const brandIds = Array.from(new Set(companies.map((c) => c.brandId)));

  const [brandsRes, contactsRes, cslRes, ucRes, workstreamsRes, tasksRes] = await Promise.all([
    supabase.from("brands").select("id, name").in("id", brandIds),
    supabase.from("client_contacts").select("*").in("company_id", companyIds),
    supabase
      .from("company_service_lines")
      .select("company_id, service_line:service_lines(id, name)")
      .in("company_id", companyIds),
    supabase.from("user_companies").select("company_id, user_id").in("company_id", companyIds),
    supabase.from("workstreams").select("id, company_id, status, updated_at").in("company_id", companyIds),
    supabase.from("tasks").select("company_id, workstream_id, status, due_date, updated_at").in("company_id", companyIds),
  ]);

  const brands = (brandsRes.data ?? []) as Brand[];
  const allContacts = (contactsRes.data ?? []).map(toContact);
  const csl = (cslRes.data ?? []) as {
    company_id: string;
    service_line: { id: string; name: string } | { id: string; name: string }[] | null;
  }[];
  const userCompanies = (ucRes.data ?? []) as { company_id: string; user_id: string }[];
  const assignedUserIds = Array.from(new Set(userCompanies.map((r) => r.user_id)));
  const usersRes = assignedUserIds.length
    ? await supabase.from("profiles").select("*").in("id", assignedUserIds)
    : { data: [] as never[] };
  const users = ((usersRes.data ?? []) as ProfileRow[]).map(toUserFromProfile);
  const workstreams = (workstreamsRes.data ?? []) as {
    id: string;
    company_id: string;
    status: WorkstreamStatus;
    updated_at: string;
  }[];
  const tasks = (tasksRes.data ?? []) as {
    company_id: string;
    workstream_id: string;
    status: TaskStatus;
    due_date: string | null;
    updated_at: string;
  }[];

  return companies.map((company) => {
    const brand = brands.find((b) => b.id === company.brandId);
    if (!brand) throw new Error(`Company ${company.id} references unknown brand ${company.brandId}`);
    const serviceLines = csl
      .filter((r) => r.company_id === company.id && r.service_line)
      .map((r) => (Array.isArray(r.service_line) ? r.service_line[0] : r.service_line) as ServiceLine)
      .filter((sl): sl is ServiceLine => sl != null);
    const primaryContact = company.primaryContactId
      ? (allContacts.find((c) => c.id === company.primaryContactId) ?? null)
      : null;
    const assignedStaffIds = userCompanies.filter((r) => r.company_id === company.id).map((r) => r.user_id);
    const assignedStaff = users.filter((u) => assignedStaffIds.includes(u.id));

    const companyWorkstreams = workstreams
      .filter((w) => w.company_id === company.id)
      .map((w) => ({ id: w.id, status: w.status, updatedAt: w.updated_at }));
    const companyTasks = tasks
      .filter((t) => t.company_id === company.id)
      .map((t) => ({ workstreamId: t.workstream_id, status: t.status, dueDate: t.due_date, updatedAt: t.updated_at }));
    const health = computeClientHealth(companyWorkstreams, companyTasks);

    return { ...company, brand, serviceLines, primaryContact, assignedStaff, health };
  });
}

interface ProfileRow {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  active: boolean;
  supervisor_id: string | null;
  reporting_review_access: boolean;
  created_at: string;
}

function toUserFromProfile(row: ProfileRow): User {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    active: row.active,
    supervisorId: row.supervisor_id,
    // assignedCompanyIds isn't needed by any current CompaniesProvider caller off this shape —
    // left empty here rather than re-fetching user_companies per staff member on every company
    // read (assignedStaff only ever needs to render name/role, per mock-companies-provider.ts).
    assignedCompanyIds: [],
    reportingReviewAccess: row.reporting_review_access,
    createdAt: row.created_at,
  };
}

export const supabaseCompaniesProvider: CompaniesProvider = {
  async listCompanies() {
    const supabase = createClient();
    const { data, error } = await supabase.from("companies").select("*").order("name");
    if (error) throw new Error(error.message);
    return hydrateCompanies((data ?? []).map(toCompany));
  },

  async getCompany(_viewer, id) {
    // A caller mid-render (e.g. a page reading a related entity's id before it has loaded) can
    // pass an empty id — treat that the same as "not found yet" rather than sending "" into a
    // uuid column comparison, which Postgres rejects outright rather than just matching nothing.
    if (!id) return null;
    const supabase = createClient();
    const { data, error } = await supabase.from("companies").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const [hydrated] = await hydrateCompanies([toCompany(data)]);
    return hydrated ?? null;
  },

  async createCompany(_viewer, input) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("companies")
      .insert({
        name: input.name,
        status: input.status,
        brand_id: input.brandId,
        contract_start_date: input.contractStartDate,
        renewal_date: input.renewalDate,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await syncCompanyServiceLines(data.id, input.serviceLineIds);
    await syncAssignedStaff(data.id, input.assignedStaffIds);
    const [hydrated] = await hydrateCompanies([toCompany(data)]);
    return hydrated;
  },

  async updateCompany(_viewer, id, input) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("companies")
      .update({
        name: input.name,
        status: input.status,
        brand_id: input.brandId,
        contract_start_date: input.contractStartDate,
        renewal_date: input.renewalDate,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await syncCompanyServiceLines(id, input.serviceLineIds);
    await syncAssignedStaff(id, input.assignedStaffIds);
    const [hydrated] = await hydrateCompanies([toCompany(data)]);
    return hydrated;
  },

  async listContacts(_viewer, companyId) {
    const supabase = createClient();
    const { data, error } = await supabase.from("client_contacts").select("*").eq("company_id", companyId);
    if (error) throw new Error(error.message);
    return (data ?? []).map(toContact);
  },

  async createContact(_viewer, companyId, input) {
    const supabase = createClient();
    if (input.isPrimary) {
      await supabase.from("client_contacts").update({ is_primary: false }).eq("company_id", companyId);
    }
    const { data, error } = await supabase
      .from("client_contacts")
      .insert({
        company_id: companyId,
        name: input.name,
        title: input.title,
        email: input.email,
        phone: input.phone,
        is_primary: input.isPrimary,
        notes: input.notes,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    if (input.isPrimary) {
      await supabase.from("companies").update({ primary_contact_id: data.id }).eq("id", companyId);
    }
    return toContact(data);
  },

  async updateContact(_viewer, contactId, input) {
    const supabase = createClient();
    const { data: existing, error: existingError } = await supabase
      .from("client_contacts")
      .select("company_id")
      .eq("id", contactId)
      .single();
    if (existingError) throw new Error(existingError.message);

    if (input.isPrimary) {
      await supabase
        .from("client_contacts")
        .update({ is_primary: false })
        .eq("company_id", existing.company_id)
        .neq("id", contactId);
    }
    const { data, error } = await supabase
      .from("client_contacts")
      .update({
        name: input.name,
        title: input.title,
        email: input.email,
        phone: input.phone,
        is_primary: input.isPrimary,
        notes: input.notes,
      })
      .eq("id", contactId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    if (input.isPrimary) {
      await supabase.from("companies").update({ primary_contact_id: contactId }).eq("id", existing.company_id);
    } else {
      await supabase
        .from("companies")
        .update({ primary_contact_id: null })
        .eq("id", existing.company_id)
        .eq("primary_contact_id", contactId);
    }
    return toContact(data);
  },

  async listBrands() {
    const supabase = createClient();
    const { data, error } = await supabase.from("brands").select("id, name").order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as Brand[];
  },

  async listServiceLines() {
    const supabase = createClient();
    const { data, error } = await supabase.from("service_lines").select("id, name").order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as ServiceLine[];
  },

  async listAssignableStaff(viewer) {
    // RLS on `profiles` (self, or your team via manages_user) already scopes SELECT correctly —
    // superadmin's own policy branch returns every profile, matching assignableStaffFor(viewer)'s
    // "everyone active" for that role and "your own team" for a supervisor. Employees get an empty
    // list here (mirroring assignableStaffFor's own `return []` for that role) rather than issuing
    // a query RLS would return nothing useful from anyway.
    if (viewer.role === "employee") return [];
    const supabase = createClient();
    const { data, error } = await supabase.from("profiles").select("*").eq("active", true).order("full_name");
    if (error) throw new Error(error.message);
    return (data ?? []).map(toUserFromProfile);
  },

  async setReportingReviewAccess(_viewer, targetUserId, enabled) {
    const supabase = createClient();
    const { error } = await supabase.rpc("set_reporting_review_access", { target_user_id: targetUserId, enabled });
    if (error) throw new Error(error.message);
  },
};

async function syncCompanyServiceLines(companyId: string, serviceLineIds: string[]) {
  const supabase = createClient();
  await supabase.from("company_service_lines").delete().eq("company_id", companyId);
  if (serviceLineIds.length > 0) {
    await supabase
      .from("company_service_lines")
      .insert(serviceLineIds.map((serviceLineId) => ({ company_id: companyId, service_line_id: serviceLineId })));
  }
}

async function syncAssignedStaff(companyId: string, staffIds: string[]) {
  const supabase = createClient();
  await supabase.from("user_companies").delete().eq("company_id", companyId);
  if (staffIds.length > 0) {
    await supabase.from("user_companies").insert(staffIds.map((userId) => ({ company_id: companyId, user_id: userId })));
  }
}
