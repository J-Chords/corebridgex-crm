"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useCompanies, useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { useProjectGroups } from "@/lib/data/hooks/use-projects";
import { projectsProvider } from "@/lib/data/providers";
import type { ProjectWithRelations } from "@/lib/data/providers/projects-provider";
import { ProjectServicePicker, type ProjectServiceSelection } from "@/components/projects/project-service-picker";
import { isSuperadmin } from "@/lib/data/permissions";
import { MultiSelect } from "@/components/ui/multi-select";
import { Sheet, SheetContent, SheetFooter, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RichDescriptionEditor } from "@/components/ui/rich-description-editor";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, ChevronDown, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const NEW_GROUP_VALUE = "__new__";

interface ProjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  project?: ProjectWithRelations;
  onSaved: () => void;
  /** When creating FROM a Company's own page, the Company is system/prefilled context, never a user
   * input: the Company field renders as read-only text instead of a picker, and this id is used
   * directly. Title is the only required field either way. The global /dashboard/projects → New
   * Project entry point (no `defaultCompanyId`) never shows this at all — it always creates a
   * brand-new Company + Project together (`isGlobalCreate` below); this legacy "attach a Project to
   * an already-existing Company" path stays reachable only from that Company's own page. */
  defaultCompanyId?: string;
}

function emptyForm() {
  return {
    companyId: "",
    name: "",
    ownerId: "",
    startDate: "",
    endDate: "",
    completionDate: "",
    // Reused for both meanings depending on path: the Project's own "Client Since" (attaching to an
    // already-existing Company — protected Admin-only after creation, Phase 6A section M) OR the
    // brand-new Company's own Contract Start/Renewal Date (the normal global flow) — distinct
    // fields on distinct tables, never conflated; see docs/architecture.md's "Contract / renewal
    // information" section. `contractMonths`/`contractEndDate` are the Project's own legacy
    // contract-term pair — no longer presented as the authoritative Current Contract (Phase 6A);
    // preserved here only so an edit submit doesn't change their already-stored values.
    contractStartDate: "",
    contractMonths: "12",
    contractEndDate: "",
    description: "",
    projectGroupId: "",
    tags: [] as string[],
    memberUserIds: [] as string[],
    services: [] as ProjectServiceSelection[],
    // Normal-global-flow-only fields ("Administrative details") — never sent when attaching to an
    // already-existing Company. `brandId` here is the brand-new Company's own master-data Brand —
    // genuinely distinct from `partnerBrandId` below (Phase 3, CD-208).
    brandId: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    // Phase 3 (CD-208) — the Project's own Partner Brand, independent of any Company Brand above.
    // Settable at CREATE by Admin or Team Lead; protected (Admin-only) after that.
    partnerBrandId: "",
  };
}

function FormSection({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border bg-card p-4", className)}>
      <span className="font-mono text-xs tracking-wider text-muted-foreground uppercase">{label}</span>
      {children}
    </div>
  );
}

/**
 * A genuinely optional group of fields, collapsed by default so the drawer opens showing only
 * Title + Project information instead of one long wall of fields. Expanding one never resets or
 * discards any value already entered in it.
 */
function CollapsibleSection({
  label,
  description,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  description?: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex items-center justify-between gap-2 text-left"
      >
        <span className="flex flex-col gap-0.5">
          <span className="font-mono text-xs tracking-wider text-muted-foreground uppercase">{label}</span>
          {description && !expanded && <span className="text-xs text-muted-foreground">{description}</span>}
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", !expanded && "-rotate-90")}
          aria-hidden="true"
        />
      </button>
      {expanded && <div className="flex flex-col gap-3">{children}</div>}
    </div>
  );
}

/**
 * Superadmin-only Project create/edit. Title (`name`) is the only required field — everything else,
 * including which Company this belongs to, is either optional or resolved automatically. Status is
 * deliberately absent here — a new Project always starts Active, and every lifecycle change (Archive/
 * Reactivate, Trash/Restore, each its own dedicated action; legacy On Hold/Canceled kept reachable
 * only for an already-existing row in that state) only ever goes through the dedicated
 * ProjectStatusControl, never this generic metadata form. Owner defaults to the creating Admin when
 * left unset at creation.
 *
 * Manual Acceptance Step 2 Correction — the normal global entry point
 * (`/dashboard/projects → New Project`, no `defaultCompanyId`) never shows a Company/"client" concept
 * at all: it always creates a brand-new Company + Project together in one atomic call
 * (`createClientProject`). The technical ability to attach a new Project to an already-existing
 * Company is preserved, but only reachable from that Company's own page (`defaultCompanyId` passed
 * in) or while editing an existing Project — never exposed as a mode choice from the normal flow.
 */
export function ProjectFormDialog({ open, onOpenChange, mode, project, onSaved, defaultCompanyId }: ProjectFormDialogProps) {
  const { user } = useAuth();
  const { companies } = useCompanies();
  const { assignableStaff, brands } = useCompanyLookups();
  const { groups, refresh: refreshGroups } = useProjectGroups();
  const isAdmin = !!user && isSuperadmin(user);
  // Phase 3 (CD-208) — protected identity fields (Project/Client Name, Partner Brand, Owner) are
  // settable by a Team Lead only at CREATE time; only Admin may change them afterward. Enforced
  // here for UX (disabled inputs) AND independently at the backend (update_project_record), which
  // is the real boundary — never trust this alone.
  const canEditProtectedFields = mode === "create" || isAdmin;

  const [form, setForm] = useState(emptyForm);
  const [tagDraft, setTagDraft] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [addingGroup, setAddingGroup] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // The ONE normal "New Project" workflow, reached only from the global entry point (no
  // defaultCompanyId, not editing): always creates a brand-new Company + Project atomically — no
  // mode choice, no Company concept surfaced at all.
  const isGlobalCreate = mode === "create" && !defaultCompanyId;
  // Every optional group starts collapsed; expanding one is a per-open decision, never a required
  // step, never sticky in a way that hides an already-entered value.
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  function toggleSection(key: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const selectedCompany = companies.find((c) => c.id === form.companyId);

  useEffect(() => {
    if (!open || !user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    setNewGroupName("");
    setAddingGroup(false);
    // Editing an existing Project shows every section open (nothing already on the record should
    // read as hidden); a brand-new Project starts with only Title + Project information visible.
    setExpandedSections(project ? new Set(["administrative", "details", "services", "members"]) : new Set());
    if (project) {
      setForm({
        ...emptyForm(),
        companyId: project.companyId,
        name: project.name,
        ownerId: project.ownerId,
        startDate: project.startDate ?? "",
        endDate: project.endDate ?? "",
        completionDate: project.completionDate ?? "",
        contractStartDate: project.contractStartDate ?? "",
        contractMonths: String(project.contractMonths ?? 12),
        contractEndDate: project.contractEndDate ?? "",
        description: project.description ?? "",
        projectGroupId: project.projectGroupId ?? "",
        tags: project.tags,
        memberUserIds: project.members.map((m) => m.id),
        partnerBrandId: project.partnerBrandId ?? "",
      });
      setNameTouched(true);
    } else {
      setForm({ ...emptyForm(), companyId: defaultCompanyId ?? "" });
      setNameTouched(false);
    }
  }, [open, project, user, defaultCompanyId]);

  // Keeps the suggested Title in sync with which Company was chosen, until the user types their own
  // — Project IS the visible Client identity (Product Owner correction), so the smart default is
  // simply the Company's own name, never a generated "{Company} {startYear}-{endYear}" range. Never
  // fires for the normal global flow (no Company resolved until after submit).
  useEffect(() => {
    if (nameTouched || mode === "edit" || !selectedCompany) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm((p) => ({ ...p, name: selectedCompany.name }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompany?.name, nameTouched, mode]);

  // Title is the only required PROJECT ATTRIBUTE. Company is structural context, resolved either by
  // creating a brand-new one automatically (isGlobalCreate — nothing to require upfront) or by
  // already being known (Company-context create, or edit).
  const requiresExistingCompany = !isGlobalCreate;
  const canSubmit =
    !isSubmitting && form.name.trim().length > 0 && (!requiresExistingCompany || form.companyId.length > 0);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        if (canSubmit) void submitForm();
      }
    }
    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", handleKeyDown, { capture: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canSubmit]);

  const groupItems = useMemo(() => {
    const items: Record<string, string> = { "": "No group" };
    for (const g of groups) items[g.id] = g.name;
    items[NEW_GROUP_VALUE] = "+ New group…";
    return items;
  }, [groups]);

  if (!user) return null;

  function commitTagDraft() {
    const tag = tagDraft.trim();
    if (!tag) return;
    setForm((p) => (p.tags.includes(tag) ? p : { ...p, tags: [...p.tags, tag] }));
    setTagDraft("");
  }

  function removeTag(tag: string) {
    setForm((p) => ({ ...p, tags: p.tags.filter((t) => t !== tag) }));
  }

  function handleGroupSelect(v: string | null) {
    if (v === NEW_GROUP_VALUE) {
      setAddingGroup(true);
      return;
    }
    setForm((p) => ({ ...p, projectGroupId: v ?? "" }));
  }

  async function handleCreateGroup() {
    if (!user || !newGroupName.trim()) return;
    setCreatingGroup(true);
    try {
      const created = await projectsProvider.createProjectGroup(user, newGroupName.trim());
      await refreshGroups();
      setForm((p) => ({ ...p, projectGroupId: created.id }));
      setNewGroupName("");
      setAddingGroup(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create Project Group.");
    } finally {
      setCreatingGroup(false);
    }
  }

  async function submitForm() {
    if (!user) return;
    setError(null);
    setIsSubmitting(true);
    try {
      // Phase 3 (CD-208) — atomic: Template selections are sent as part of the same create call
      // (create_project/create_client_project apply them inside their own transaction) instead of
      // a separate best-effort post-creation loop. A failed Template application now rolls back
      // the whole Project creation, never leaving a partially-created Project.
      const templates = form.services.map((svc) => ({ serviceLineId: svc.serviceLineId, activityIds: svc.activityIds }));

      if (isGlobalCreate) {
        // ONE atomic call — the RPC/mock creates the Company (+ optional primary contact) and the
        // Project together; Title doubles as the new Company's name, never a second name field.
        await projectsProvider.createClientProject(user, {
          name: form.name.trim(),
          brandId: form.brandId || null,
          partnerBrandId: form.partnerBrandId || form.brandId || null,
          contractStartDate: form.contractStartDate || null,
          renewalDate: form.contractEndDate || null,
          contactName: form.contactName.trim() || null,
          contactEmail: form.contactEmail.trim() || null,
          contactPhone: form.contactPhone.trim() || null,
          ownerId: isAdmin ? form.ownerId || null : null,
          completionDate: form.completionDate || null,
          startDate: form.startDate || null,
          endDate: form.endDate || null,
          description: form.description.trim() || null,
          projectGroupId: form.projectGroupId || null,
          tags: form.tags,
          memberUserIds: isAdmin ? form.memberUserIds : [],
          templates,
        });
      } else {
        const input = {
          companyId: form.companyId,
          name: form.name.trim(),
          ownerId: isAdmin ? form.ownerId || null : null,
          contractStartDate: form.contractStartDate || null,
          contractMonths: Number(form.contractMonths) || 12,
          contractEndDate: form.contractEndDate || null,
          completionDate: form.completionDate || null,
          startDate: form.startDate || null,
          endDate: form.endDate || null,
          description: form.description.trim() || null,
          projectGroupId: form.projectGroupId || null,
          partnerBrandId: form.partnerBrandId || null,
          tags: form.tags,
          memberUserIds: isAdmin ? form.memberUserIds : [],
          templates,
        };
        if (mode === "edit" && project) {
          await projectsProvider.updateProject(user, project.id, input);
        } else {
          await projectsProvider.createProject(user, input);
        }
      }

      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save project.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitForm();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Task Level Phase 2, Section 28 — Product Owner-confirmed width correction. `SheetContent`'s
          own default hardcodes `data-[side=right]:sm:max-w-sm`; a plain `sm:max-w-4xl` here has a
          shorter modifier chain (no `data-[side=right]:` prefix), so tailwind-merge never recognizes
          it as the same utility group and CSS specificity lets the narrower default win — the drawer
          silently stayed ~24rem wide regardless of this className. Matching the exact modifier chain
          makes this the one utility tailwind-merge dedupes correctly, and is what New Project and
          Edit Project now consistently render at (same component, same shell, same width). */}
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 data-[side=right]:sm:max-w-4xl">
        <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-2 px-6 pt-6 pb-2">
              <SheetTitle className="font-mono text-xs tracking-wider text-muted-foreground uppercase">
                {mode === "create" ? "New project" : "Edit project"}
              </SheetTitle>
              <SheetDescription className="sr-only">
                {mode === "create" ? "Create a new Project." : `Editing "${project?.name ?? "this project"}".`}
              </SheetDescription>
              <Input
                autoFocus={canEditProtectedFields}
                value={form.name}
                disabled={!canEditProtectedFields}
                onChange={(e) => {
                  setNameTouched(true);
                  setForm((p) => ({ ...p, name: e.target.value }));
                }}
                placeholder="Title"
                aria-label="Title"
                className="h-auto rounded-none border-0 bg-transparent p-0 font-heading text-2xl font-semibold tracking-tight shadow-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-100"
              />
              {!canEditProtectedFields && (
                <p className="text-xs text-muted-foreground">
                  Project/Client Name can only be changed by an Admin.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-4 px-6 py-4">
              <FormSection label="Project information">
                <RichDescriptionEditor
                  value={form.description}
                  onChange={(value) => setForm((p) => ({ ...p, description: value }))}
                  placeholder="Add a description…"
                  rows={3}
                />
              </FormSection>

              <CollapsibleSection
                label="Administrative details (optional)"
                description={
                  isGlobalCreate
                    ? "Partner Brand, contact, contract/renewal."
                    : "Client Since."
                }
                expanded={expandedSections.has("administrative")}
                onToggle={() => toggleSection("administrative")}
              >
                {/* Product Owner acceptance correction — Project IS the visible Client/Company
                    identity (the Title above already shows it); a separate read-only "Company"
                    field here just repeated it. companyId is still resolved/submitted internally
                    (from `project.companyId` on edit, `defaultCompanyId` on create) — this only
                    removes the redundant on-screen field, not the underlying relationship. */}
                {isGlobalCreate && (
                  <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="project-client-brand">Company Brand</Label>
                        <Select
                          items={{ "": "No brand yet", ...Object.fromEntries(brands.map((b) => [b.id, b.name])) }}
                          value={form.brandId}
                          onValueChange={(v) =>
                            setForm((p) => ({
                              ...p,
                              brandId: v ?? "",
                              // Convenience default only — Partner Brand stays independently
                              // user-changeable, never a live sync (CD-208 section 16).
                              partnerBrandId: p.partnerBrandId || v || "",
                            }))
                          }
                        >
                          <SelectTrigger id="project-client-brand" className="w-full">
                            <SelectValue placeholder="No brand yet" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">No brand yet</SelectItem>
                            {brands.map((b) => (
                              <SelectItem key={b.id} value={b.id}>
                                {b.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="project-contact-name">Primary Contact</Label>
                        <Input
                          id="project-contact-name"
                          value={form.contactName}
                          onChange={(e) => setForm((p) => ({ ...p, contactName: e.target.value }))}
                          placeholder="Name"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="project-contact-email">Email</Label>
                        <Input
                          id="project-contact-email"
                          type="email"
                          value={form.contactEmail}
                          onChange={(e) => setForm((p) => ({ ...p, contactEmail: e.target.value }))}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="project-contact-phone">Phone</Label>
                        <Input
                          id="project-contact-phone"
                          type="tel"
                          value={form.contactPhone}
                          onChange={(e) => setForm((p) => ({ ...p, contactPhone: e.target.value }))}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="project-client-contract-start">Contract Start</Label>
                        <Input
                          id="project-client-contract-start"
                          type="date"
                          value={form.contractStartDate}
                          onChange={(e) => setForm((p) => ({ ...p, contractStartDate: e.target.value }))}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="project-client-renewal">Renewal Date</Label>
                        <Input
                          id="project-client-renewal"
                          type="date"
                          value={form.contractEndDate}
                          onChange={(e) => setForm((p) => ({ ...p, contractEndDate: e.target.value }))}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Choose a Partner Brand to configure Templates and Activities. You can also create the Project now
                      and add Templates later. Contract/renewal is optional master data, distinct from this Project&apos;s
                      own Start/End dates below.
                    </p>
                  </>
                )}
              </CollapsibleSection>

              <CollapsibleSection
                label="Project details (optional)"
                description="Owner, dates, Project Group, tags."
                expanded={expandedSections.has("details")}
                onToggle={() => toggleSection("details")}
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="project-owner">Owner</Label>
                    {isAdmin ? (
                      <Select
                        items={{ "": "Defaults to you", ...Object.fromEntries(assignableStaff.map((s) => [s.id, s.fullName])) }}
                        value={form.ownerId}
                        onValueChange={(v) => setForm((p) => ({ ...p, ownerId: v ?? "" }))}
                      >
                        <SelectTrigger id="project-owner" className="w-full">
                          <SelectValue placeholder="Defaults to you" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Defaults to you</SelectItem>
                          {assignableStaff.map((staff) => (
                            <SelectItem key={staff.id} value={staff.id}>
                              {staff.fullName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      // Phase 3 (CD-208) — a Team Lead always becomes the owner of their own
                      // Project; they can neither pick another owner at creation nor reassign it
                      // afterward. Enforced server-side (create_project/update_project_record),
                      // this is read-only display only.
                      <div className="flex h-9 items-center text-sm text-muted-foreground">
                        {mode === "edit" && project ? project.owner.fullName : `${user.fullName} (you)`}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="project-partner-brand">Partner Brand</Label>
                    <Select
                      items={{ "": "No brand set", ...Object.fromEntries(brands.map((b) => [b.id, b.name])) }}
                      value={form.partnerBrandId}
                      disabled={!canEditProtectedFields}
                      onValueChange={(v) => setForm((p) => ({ ...p, partnerBrandId: v ?? "" }))}
                    >
                      <SelectTrigger id="project-partner-brand" className="w-full" disabled={!canEditProtectedFields}>
                        <SelectValue placeholder="No brand set" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">No brand set</SelectItem>
                        {brands.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!canEditProtectedFields && (
                      <p className="text-xs text-muted-foreground">Only an Admin can change Partner Brand.</p>
                    )}
                  </div>
                  {mode === "create" && (
                    <div className="flex flex-col gap-1.5">
                      <Label>Status</Label>
                      <div className="flex h-9 items-center">
                        <Badge variant="secondary">Active</Badge>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="project-group">Project Group</Label>
                    <Select items={groupItems} value={form.projectGroupId} onValueChange={handleGroupSelect}>
                      <SelectTrigger id="project-group" className="w-full">
                        <SelectValue placeholder="No group" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(groupItems).map(([value, label]) => (
                          <SelectItem key={value || "none"} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {addingGroup && (
                      <div className="flex gap-1.5">
                        <Input
                          autoFocus
                          value={newGroupName}
                          onChange={(e) => setNewGroupName(e.target.value)}
                          placeholder="New Project Group name…"
                          className="h-8 text-sm"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!newGroupName.trim() || creatingGroup}
                          onClick={handleCreateGroup}
                        >
                          Add
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                {/* Product Owner acceptance correction (Project = Client model) — Start/End Date have
                    no downstream consumer beyond this form and the Overview page's own already-
                    conditional display, so both are removed from create/edit for V1 (the `startDate`/
                    `endDate`/`completionDate` columns and any already-set legacy value are untouched —
                    only these input paths are gone). Completion Date is gone too: a client workspace
                    doesn't get manually marked "completed" — its Archived-On date is now recorded
                    automatically from the dedicated Archive action (`ProjectStatusControl`), never a
                    freely-editable field here. */}

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="project-tags">Tags</Label>
                  <div className="flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5">
                    {form.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                        {tag}
                        <button type="button" onClick={() => removeTag(tag)} aria-label={`Remove tag ${tag}`} className="rounded-full p-0.5 hover:bg-muted-foreground/20">
                          <X className="size-3" aria-hidden="true" />
                        </button>
                      </Badge>
                    ))}
                    <input
                      id="project-tags"
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          commitTagDraft();
                        } else if (e.key === "Backspace" && !tagDraft && form.tags.length > 0) {
                          removeTag(form.tags[form.tags.length - 1]);
                        }
                      }}
                      onBlur={commitTagDraft}
                      placeholder={form.tags.length === 0 ? "Type a tag, press Enter…" : "Add another…"}
                      className="h-6 min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                </div>

                {!isGlobalCreate && (
                  <div className="flex flex-col gap-1.5 border-t pt-3">
                    <Label htmlFor="project-client-since">Client Since</Label>
                    <Input
                      id="project-client-since"
                      type="date"
                      value={form.contractStartDate}
                      disabled={!canEditProtectedFields}
                      onChange={(e) => setForm((p) => ({ ...p, contractStartDate: e.target.value }))}
                    />
                    {!canEditProtectedFields && (
                      <p className="text-xs text-muted-foreground">Only an Admin can correct Client Since.</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      The original Project/engagement start — distinct from this Project&apos;s own Start/End work
                      dates. Never advances on annual renewal; see the Project Overview&apos;s own Current Contract
                      for the operational contract period.
                    </p>
                  </div>
                )}
              </CollapsibleSection>

              {mode === "create" && (
                <CollapsibleSection
                  label="Templates (optional)"
                  description="Select existing Templates and their Activities."
                  expanded={expandedSections.has("services")}
                  onToggle={() => toggleSection("services")}
                >
                  <p className="text-xs text-muted-foreground">
                    Select existing Templates this Project uses, and which of each Template&apos;s existing Activities
                    apply — leave empty to start with none.
                  </p>
                  {!isGlobalCreate && !selectedCompany ? (
                    <p className="text-sm text-muted-foreground">Loading company…</p>
                  ) : (
                    <ProjectServicePicker
                      value={form.services}
                      onChange={(services) => setForm((p) => ({ ...p, services }))}
                    />
                  )}
                </CollapsibleSection>
              )}

              {/* Phase 3 (CD-208) section 29 — Team Lead gains no new Member-staffing rights in
                  Phase 3; this control stays Admin-only (Phase 4 owns the broader staffing model). */}
              {isAdmin && (
                <CollapsibleSection
                  label="Members (optional)"
                  description="Who's on this Project."
                  expanded={expandedSections.has("members")}
                  onToggle={() => toggleSection("members")}
                >
                  <MultiSelect
                    options={assignableStaff.map((s) => ({ id: s.id, label: s.fullName, sublabel: s.email }))}
                    value={form.memberUserIds}
                    onChange={(ids) => setForm((p) => ({ ...p, memberUserIds: ids }))}
                    placeholder="No members"
                    searchPlaceholder="Search people…"
                    aria-label="Project members"
                  />
                </CollapsibleSection>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertCircle aria-hidden="true" />
                  <AlertTitle>{error}</AlertTitle>
                </Alert>
              )}
            </div>
          </div>

          <SheetFooter className="flex-row justify-end gap-2 border-t bg-card">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting ? "Saving…" : mode !== "create" ? "Save changes" : "Create Project"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
