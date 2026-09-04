import type { Activity, ServiceLine, User } from "../types";

export interface ServiceLineInput {
  name: string;
  description: string | null;
}

/**
 * Service Level Phase B, Sections 10-13 — the Admin global Service catalog's own CRUD surface.
 * Distinct from `CompaniesProvider.listServiceLines` (the ordinary active-only "pick a Service"
 * lookup every Company/Project/Workstream picker already uses) — this provider is Admin-only and
 * sees inactive Services too, since managing them (reactivating, reviewing why something's
 * deactivated) is exactly the point. Reuses the existing `service_lines` table; never a competing
 * catalog. Mutation is Superadmin-only, re-enforced server-side regardless of what the client sends.
 */
export interface ServiceLinesProvider {
  /** Every Service, active and inactive — Admin catalog view only. */
  listAll(viewer: User): Promise<ServiceLine[]>;
  create(viewer: User, input: ServiceLineInput): Promise<ServiceLine>;
  update(viewer: User, id: string, input: ServiceLineInput): Promise<ServiceLine>;
  setActive(viewer: User, id: string, isActive: boolean): Promise<ServiceLine>;
  /**
   * Hard-deletes only when the Service has never been used anywhere (Projects/Templates/Activities/
   * staffing) — the database itself is the proof (a referencing foreign key simply blocks the
   * delete). Throws a friendly error directing to `setActive(false)` instead when that happens;
   * never silently converts a delete into a deactivation.
   */
  delete(viewer: User, id: string): Promise<void>;
  /**
   * Admin catalog analogue of `WorkstreamsProvider.createActivityForWorkstream` — adds a new global
   * Activity to this Service Line for a given Brand (find-or-create the Department the same 1:1
   * convention every other Department follows). Superadmin-only; a Team Lead/Project Service Lead
   * may still select/configure existing Activities, just never mint a new one.
   */
  createActivity(viewer: User, serviceLineId: string, brandId: string, name: string): Promise<Activity>;
}
