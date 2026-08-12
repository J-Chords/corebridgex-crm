import type { CompaniesProvider } from "../companies-provider";

const notImplemented = (): never => {
  throw new Error("supabaseCompaniesProvider is not implemented yet — use the mock provider.");
};

/** Real backend slot-in point — same shape as mockCompaniesProvider, no screen changes needed to swap. */
export const supabaseCompaniesProvider: CompaniesProvider = {
  listCompanies: notImplemented,
  getCompany: notImplemented,
  createCompany: notImplemented,
  updateCompany: notImplemented,
  listContacts: notImplemented,
  createContact: notImplemented,
  updateContact: notImplemented,
  listBrands: notImplemented,
  listServiceLines: notImplemented,
  listAssignableStaff: notImplemented,
};
