/** Reference-only contact at a client company — never a login. */
export interface ClientContact {
  id: string;
  companyId: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  isPrimary: boolean;
  notes: string | null;
}
