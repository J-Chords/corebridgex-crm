import type { Brand, ClientContact, Company, CompanyStatus, ServiceLine, User } from "../types";
import type { ClientHealth } from "../client-health";

/** Company joined with the read-shape screens actually need — not a raw schema row. */
export interface CompanyWithRelations extends Company {
  brand: Brand;
  serviceLines: ServiceLine[];
  primaryContact: ClientContact | null;
  assignedStaff: User[];
  /** Computed on every read from this company's own workstreams/tasks — never stored. */
  health: ClientHealth;
}

export interface CompanyInput {
  name: string;
  status: CompanyStatus;
  brandId: string;
  serviceLineIds: string[];
  contractStartDate: string | null;
  renewalDate: string | null;
  assignedStaffIds: string[];
}

export interface ClientContactInput {
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  notes: string | null;
}

/**
 * Contract every provider (mock, Supabase, future AWS) must implement.
 * Every method takes the requesting `viewer` and enforces the company
 * visibility gate (src/lib/data/permissions.ts) itself, so screens never
 * need to re-derive who's allowed to see what.
 */
export interface CompaniesProvider {
  listCompanies(viewer: User): Promise<CompanyWithRelations[]>;
  getCompany(viewer: User, id: string): Promise<CompanyWithRelations | null>;
  createCompany(viewer: User, input: CompanyInput): Promise<CompanyWithRelations>;
  updateCompany(viewer: User, id: string, input: CompanyInput): Promise<CompanyWithRelations>;

  listContacts(viewer: User, companyId: string): Promise<ClientContact[]>;
  createContact(viewer: User, companyId: string, input: ClientContactInput): Promise<ClientContact>;
  updateContact(viewer: User, contactId: string, input: ClientContactInput): Promise<ClientContact>;

  listBrands(): Promise<Brand[]>;
  listServiceLines(): Promise<ServiceLine[]>;
  /** Staff this viewer is allowed to assign to a company (their own team, or everyone for superadmin). */
  listAssignableStaff(viewer: User): Promise<User[]>;
}
