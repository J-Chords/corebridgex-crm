import type { CompaniesProvider, CompanyWithRelations } from "../companies-provider";
import type { Brand, ClientContact, Company, User } from "../../types";
import { canAccessCompany, canManageCompanies, isSuperadmin, assignableStaffFor, visibleCompanyIds } from "../../permissions";
import { computeClientHealth } from "../../client-health";
import { db } from "./mock-db";

function toCompanyWithRelations(company: Company): CompanyWithRelations {
  // Null brandId is a genuine, valid "no Brand chosen yet" state (Project/client consolidation) —
  // only a NON-null brandId that matches no real brand row is a real data-integrity error.
  let brand: Brand | null = null;
  if (company.brandId) {
    brand = db.brands.find((b) => b.id === company.brandId) ?? null;
    if (!brand) {
      throw new Error(`Company ${company.id} references unknown brand ${company.brandId}`);
    }
  }
  const serviceLineIds = db.companyServiceLines
    .filter((csl) => csl.companyId === company.id)
    .map((csl) => csl.serviceLineId);
  const serviceLines = db.serviceLines.filter((sl) => serviceLineIds.includes(sl.id));
  const primaryContact = company.primaryContactId
    ? (db.contacts.find((c) => c.id === company.primaryContactId) ?? null)
    : null;
  const assignedStaff = db.users.filter((u) => u.assignedCompanyIds.includes(company.id));

  const companyWorkstreams = db.workstreams
    .filter((w) => w.companyId === company.id)
    .map((w) => ({ id: w.id, status: w.status, updatedAt: w.updatedAt }));
  const companyTasks = db.tasks
    .filter((t) => t.companyId === company.id)
    .map((t) => ({ workstreamId: t.workstreamId, status: t.status, dueDate: t.dueDate, updatedAt: t.updatedAt }));
  const health = computeClientHealth(companyWorkstreams, companyTasks);

  return { ...company, brand, serviceLines, primaryContact, assignedStaff, health };
}

function requireAccess(viewer: User, companyId: string) {
  if (!canAccessCompany(viewer, companyId, db.users)) {
    throw new Error("You don't have access to this company.");
  }
}

function requireManage(viewer: User, companyId?: string) {
  if (!canManageCompanies(viewer)) {
    throw new Error("Only supervisors and superadmins can manage companies.");
  }
  if (companyId) requireAccess(viewer, companyId);
}

/** Adds/removes `companyId` from every affected user's assignedCompanyIds so the two stay in sync. */
function syncAssignedStaff(companyId: string, staffIds: string[]) {
  db.users = db.users.map((u) => {
    const shouldHave = staffIds.includes(u.id);
    const has = u.assignedCompanyIds.includes(companyId);
    if (shouldHave === has) return u;
    return {
      ...u,
      assignedCompanyIds: shouldHave
        ? [...u.assignedCompanyIds, companyId]
        : u.assignedCompanyIds.filter((id) => id !== companyId),
    };
  });
}

function syncServiceLines(companyId: string, serviceLineIds: string[]) {
  db.companyServiceLines = [
    ...db.companyServiceLines.filter((csl) => csl.companyId !== companyId),
    ...serviceLineIds.map((serviceLineId) => ({ companyId, serviceLineId, customFields: {} })),
  ];
}

export const mockCompaniesProvider: CompaniesProvider = {
  async listCompanies(viewer) {
    const visible = visibleCompanyIds(viewer, db.users);
    const companies =
      visible === "all" ? db.companies : db.companies.filter((c) => visible.includes(c.id));
    return companies.map(toCompanyWithRelations);
  },

  async getCompany(viewer, id) {
    const company = db.companies.find((c) => c.id === id);
    if (!company) return null;
    if (!canAccessCompany(viewer, id, db.users)) return null;
    return toCompanyWithRelations(company);
  },

  async createCompany(viewer, input) {
    requireManage(viewer);
    const id = crypto.randomUUID();
    const company: Company = {
      id,
      name: input.name,
      status: input.status,
      brandId: input.brandId,
      primaryContactId: null,
      contractStartDate: input.contractStartDate,
      renewalDate: input.renewalDate,
      active: true,
      createdAt: new Date().toISOString(),
    };
    db.companies = [...db.companies, company];
    syncServiceLines(id, input.serviceLineIds);
    syncAssignedStaff(id, input.assignedStaffIds);
    return toCompanyWithRelations(company);
  },

  async updateCompany(viewer, id, input) {
    requireManage(viewer, id);
    const existing = db.companies.find((c) => c.id === id);
    if (!existing) throw new Error("Company not found.");

    const updated: Company = {
      ...existing,
      name: input.name,
      status: input.status,
      brandId: input.brandId,
      contractStartDate: input.contractStartDate,
      renewalDate: input.renewalDate,
    };
    db.companies = db.companies.map((c) => (c.id === id ? updated : c));
    syncServiceLines(id, input.serviceLineIds);
    syncAssignedStaff(id, input.assignedStaffIds);
    return toCompanyWithRelations(updated);
  },

  async listContacts(viewer, companyId) {
    requireAccess(viewer, companyId);
    return db.contacts.filter((c) => c.companyId === companyId);
  },

  async createContact(viewer, companyId, input) {
    requireManage(viewer, companyId);
    const contact: ClientContact = { id: crypto.randomUUID(), companyId, ...input };
    if (contact.isPrimary) {
      db.contacts = db.contacts.map((c) =>
        c.companyId === companyId ? { ...c, isPrimary: false } : c
      );
    }
    db.contacts = [...db.contacts, contact];
    if (contact.isPrimary) {
      db.companies = db.companies.map((c) =>
        c.id === companyId ? { ...c, primaryContactId: contact.id } : c
      );
    }
    return contact;
  },

  async updateContact(viewer, contactId, input) {
    const existing = db.contacts.find((c) => c.id === contactId);
    if (!existing) throw new Error("Contact not found.");
    requireManage(viewer, existing.companyId);

    const updated: ClientContact = { ...existing, ...input };
    if (updated.isPrimary) {
      db.contacts = db.contacts.map((c) =>
        c.companyId === existing.companyId && c.id !== contactId ? { ...c, isPrimary: false } : c
      );
    }
    db.contacts = db.contacts.map((c) => (c.id === contactId ? updated : c));
    db.companies = db.companies.map((c) => {
      if (c.id !== existing.companyId) return c;
      if (updated.isPrimary) return { ...c, primaryContactId: updated.id };
      if (c.primaryContactId === updated.id) return { ...c, primaryContactId: null };
      return c;
    });
    return updated;
  },

  async listBrands() {
    return db.brands;
  },

  async listServiceLines() {
    return db.serviceLines.filter((sl) => sl.isActive);
  },

  async listAssignableStaff(viewer) {
    return assignableStaffFor(viewer, db.users);
  },

  async setReportingReviewAccess(viewer, targetUserId, enabled) {
    if (!isSuperadmin(viewer)) {
      throw new Error("Only a superadmin can grant or revoke reporting review access.");
    }
    const target = db.users.find((u) => u.id === targetUserId);
    if (!target) throw new Error(`Profile ${targetUserId} not found.`);
    db.users = db.users.map((u) => (u.id === targetUserId ? { ...u, reportingReviewAccess: enabled } : u));
  },
};
