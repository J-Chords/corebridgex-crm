"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useCompanies, useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { useProjectGroups } from "@/lib/data/hooks/use-projects";
import { projectsProvider, workstreamsProvider } from "@/lib/data/providers";
import type { ProjectWithRelations } from "@/lib/data/providers/projects-provider";
import { ProjectServicePicker, type ProjectServiceSelection } from "@/components/projects/project-service-picker";
import { deriveWorkstreamName } from "@/lib/data/workstream-name";
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

/** Suggests "{Company} {startYear}-{endYear}" once a real contract start date exists — the same
 * naming convention the Phase 8A backfill already established — never forced, always editable. */
function suggestedName(companyName: string, contractStartDate: string) {
  const startYear = new Date(contractStartDate).getUTCFullYear();
  return `${companyName} ${startYear}-${startYear + 1}`;
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function emptyForm() {
  return {
    companyId: "",
    name: "",
    ownerId: "",
    startDate: "",
    endDate: "",
    completionDate: "",
    // Reused for both meanings depending on path: the Project's own mirrored contract term
    // (attaching to an already-existing Company) OR the brand-new Company's own contract-
    // start/renewal (the normal global flow) — the same historical "Company contract mirrors onto
    // Project contract" precedent either way.
    contractStartDate: "",
    contractMonths: "12",
    contractEndDate: "",
    description: "",
    projectGroupId: "",
    tags: [] as string[],
    memberUserIds: [] as string[],
    services: [] as ProjectServiceSelection[],
    // Normal-global-flow-only fields ("Administrative details") — never sent when attaching to an
    // already-existing Company.
    brandId: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
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
 * deliberately absent here — a new Project always starts Active, and every lifecycle change
 * (On Hold/Canceled with a required reason, Completed, Archived, Trash/Restore as separate explicit
 * actions) only ever goes through the dedicated ProjectStatusControl, never this generic metadata
 * form. Owner defaults to the creating Admin when left unset at creation.
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
  const { assignableStaff, brands, serviceLines } = useCompanyLookups();
  const { groups, refresh: refreshGroups } = useProjectGroups();

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
      });
      setNameTouched(true);
    } else {
      setForm({ ...emptyForm(), companyId: defaultCompanyId ?? "" });
      setNameTouched(false);
    }
  }, [open, project, user, defaultCompanyId]);

  // Keeps the suggested name in sync with Company/start-date choices until the user types their
  // own name — the exact same "smart default until manually overridden" pattern the qualifier
  // field on WorkstreamFormDialog established, just applied to a full name instead of a suffix.
  // Never fires for the normal global flow (no Company resolved until after submit).
  useEffect(() => {
    if (nameTouched || mode === "edit" || !selectedCompany || !form.contractStartDate) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm((p) => ({ ...p, name: suggestedName(selectedCompany.name, form.contractStartDate) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompany?.name, form.contractStartDate, nameTouched, mode]);

  const suggestedEnd =
    form.contractStartDate && form.contractMonths
      ? addMonths(form.contractStartDate, Number(form.contractMonths) || 12)
      : null;

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

  /** Best-effort, post-creation: the Project itself is already real by the time this runs, so a
   * Service failure never rolls it back — it's reported honestly instead rather than silently
   * swallowed or falsely reported as full success. */
  async function attachServices(companyId: string, projectId: string, ownerId: string) {
    const failures: string[] = [];
    for (const svc of form.services) {
      const serviceLineName = serviceLines.find((sl) => sl.id === svc.serviceLineId)?.name ?? null;
      const name = deriveWorkstreamName(serviceLineName, "");
      try {
        await workstreamsProvider.createWorkstream(user!, {
          name,
          description: null,
          companyId,
          projectId,
          serviceLineId: svc.serviceLineId,
          leadUserId: ownerId,
          teamUserIds: [],
          status: "active",
          startDate: null,
          endDate: null,
          recurrenceFrequency: null,
          recurrenceAnchorDate: null,
          recurrenceCustomIntervalDays: null,
          activityIds: svc.activityIds,
        });
      } catch (err) {
        failures.push(`${name}: ${err instanceof Error ? err.message : "failed"}`);
      }
    }
    return failures;
  }

  async function submitForm() {
    if (!user) return;
    setError(null);
    setIsSubmitting(true);
    try {
      let companyId: string;
      let projectId: string;
      let ownerId: string;
      if (isGlobalCreate) {
        // ONE atomic call — the RPC/mock creates the Company (+ optional primary contact) and the
        // Project together; Title doubles as the new Company's name, never a second name field.
        const created = await projectsProvider.createClientProject(user, {
          name: form.name.trim(),
          brandId: form.brandId || null,
          contractStartDate: form.contractStartDate || null,
          renewalDate: form.contractEndDate || null,
          contactName: form.contactName.trim() || null,
          contactEmail: form.contactEmail.trim() || null,
          contactPhone: form.contactPhone.trim() || null,
          ownerId: form.ownerId || null,
          completionDate: form.completionDate || null,
          startDate: form.startDate || null,
          endDate: form.endDate || null,
          description: form.description.trim() || null,
          projectGroupId: form.projectGroupId || null,
          tags: form.tags,
          memberUserIds: form.memberUserIds,
        });
        companyId = created.companyId;
        projectId = created.id;
        ownerId = created.owner.id;
      } else {
        const input = {
          companyId: form.companyId,
          name: form.name.trim(),
          ownerId: form.ownerId || null,
          contractStartDate: form.contractStartDate || null,
          contractMonths: Number(form.contractMonths) || 12,
          contractEndDate: form.contractEndDate || null,
          completionDate: form.completionDate || null,
          startDate: form.startDate || null,
          endDate: form.endDate || null,
          description: form.description.trim() || null,
          projectGroupId: form.projectGroupId || null,
          tags: form.tags,
          memberUserIds: form.memberUserIds,
        };
        if (mode === "edit" && project) {
          const saved = await projectsProvider.updateProject(user, project.id, input);
          companyId = saved.companyId;
          projectId = saved.id;
          ownerId = saved.owner.id;
        } else {
          const created = await projectsProvider.createProject(user, input);
          companyId = created.companyId;
          projectId = created.id;
          ownerId = created.owner.id;
        }
      }

      const failures = mode === "create" && form.services.length > 0 ? await attachServices(companyId, projectId, ownerId) : [];

      onSaved();
      if (failures.length > 0) {
        setError(
          `Project created, but ${failures.length} of ${form.services.length} service(s) couldn't be attached (${failures.join("; ")}). Add them from the Project's Services tab.`
        );
        setIsSubmitting(false);
        return;
      }
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
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-4xl">
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
                autoFocus
                value={form.name}
                onChange={(e) => {
                  setNameTouched(true);
                  setForm((p) => ({ ...p, name: e.target.value }));
                }}
                placeholder="Title"
                aria-label="Title"
                className="h-auto rounded-none border-0 bg-transparent p-0 font-heading text-2xl font-semibold tracking-tight shadow-none focus-visible:ring-0"
              />
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
                    : "Company, contract term."
                }
                expanded={expandedSections.has("administrative")}
                onToggle={() => toggleSection("administrative")}
              >
                {requiresExistingCompany && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="project-company">Company</Label>
                    <p id="project-company" className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                      {mode === "edit" ? project?.companyName : companies.find((c) => c.id === defaultCompanyId)?.name ?? "This company"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      A Project is the operational workspace for one Company — the Company itself is permanent and
                      unaffected by which Projects it has.
                    </p>
                  </div>
                )}

                {isGlobalCreate && (
                  <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="project-client-brand">Partner Brand</Label>
                        <Select
                          items={{ "": "No brand yet", ...Object.fromEntries(brands.map((b) => [b.id, b.name])) }}
                          value={form.brandId}
                          onValueChange={(v) => setForm((p) => ({ ...p, brandId: v ?? "" }))}
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
                      Choose a Partner Brand to configure Services and Activities. You can also create the Project now
                      and add Services later. Contract/renewal is optional master data, distinct from this Project&apos;s
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
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="project-completion">Completion Date</Label>
                    <Input
                      id="project-completion"
                      type="date"
                      value={form.completionDate}
                      onChange={(e) => setForm((p) => ({ ...p, completionDate: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="project-start">Start Date</Label>
                    <Input
                      id="project-start"
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="project-end">End Date</Label>
                    <Input
                      id="project-end"
                      type="date"
                      value={form.endDate}
                      onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Start/End are this Project&apos;s own planned work timeline — distinct from the Contract term below.
                  Completion date is the real, actual date work finished, and is set automatically the first time this
                  Project moves to Completed if not already set here. All three are optional and independently stored.
                </p>

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
                  <div className="flex flex-col gap-3 border-t pt-3">
                    <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                      Contract term (annual client contract, not this Project&apos;s own work dates)
                    </span>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="project-contract-start">Contract start</Label>
                        <Input
                          id="project-contract-start"
                          type="date"
                          value={form.contractStartDate}
                          onChange={(e) => setForm((p) => ({ ...p, contractStartDate: e.target.value }))}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="project-contract-months">Duration (months)</Label>
                        <Input
                          id="project-contract-months"
                          type="number"
                          min="1"
                          value={form.contractMonths}
                          onChange={(e) => setForm((p) => ({ ...p, contractMonths: e.target.value }))}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="project-contract-end">Contract end</Label>
                        <Input
                          id="project-contract-end"
                          type="date"
                          value={form.contractEndDate}
                          onChange={(e) => setForm((p) => ({ ...p, contractEndDate: e.target.value }))}
                        />
                        {suggestedEnd && suggestedEnd !== form.contractEndDate && (
                          <button
                            type="button"
                            onClick={() => setForm((p) => ({ ...p, contractEndDate: suggestedEnd }))}
                            className="w-fit text-left text-xs text-primary hover:underline"
                          >
                            Use suggested: {suggestedEnd}
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Feeds &quot;Renew Project&quot;&apos;s suggested next term — never this Project&apos;s own work timeline above.
                    </p>
                  </div>
                )}
              </CollapsibleSection>

              {mode === "create" && (
                <CollapsibleSection
                  label="Services (optional)"
                  description="Select existing Services and their Activities."
                  expanded={expandedSections.has("services")}
                  onToggle={() => toggleSection("services")}
                >
                  <p className="text-xs text-muted-foreground">
                    Select existing Services this Project uses, and which of each Service&apos;s existing Activities
                    apply — leave empty to start with none.
                  </p>
                  {!isGlobalCreate && !selectedCompany ? (
                    <p className="text-sm text-muted-foreground">Loading company…</p>
                  ) : (
                    <ProjectServicePicker
                      brandId={isGlobalCreate ? form.brandId || null : (selectedCompany?.brand?.id ?? null)}
                      value={form.services}
                      onChange={(services) => setForm((p) => ({ ...p, services }))}
                    />
                  )}
                </CollapsibleSection>
              )}

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
