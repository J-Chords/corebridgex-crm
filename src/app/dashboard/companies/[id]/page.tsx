"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil, Plus, Sparkles, Star } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useCompany } from "@/lib/data/hooks/use-companies";
import { useWorkstreams } from "@/lib/data/hooks/use-workstreams";
import { useTasks } from "@/lib/data/hooks/use-tasks";
import { canManageCompanies, canManageWorkstreams } from "@/lib/data/permissions";
import type { ClientContact } from "@/lib/data/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ChecklistProgress } from "@/components/ui/checklist-progress";
import { CompanyStatusBadge } from "@/components/companies/company-status-badge";
import { ClientHealthSummary } from "@/components/companies/client-health-badge";
import { CompanyFormDialog } from "@/components/companies/company-form-dialog";
import { ContactFormDialog } from "@/components/companies/contact-form-dialog";
import { WorkstreamStatusBadge } from "@/components/workstreams/workstream-status-badge";
import { WorkstreamFormDialog } from "@/components/workstreams/workstream-form-dialog";
import { BudgetBar, BudgetBarCompact } from "@/components/ui/budget-bar";
import { computeBudgetRollup } from "@/lib/data/time-budget";
import { RecurrenceIndicatorCompact } from "@/components/workstreams/recurrence-indicator";
import { ApplyTemplateDialog } from "@/components/templates/apply-template-dialog";
import { TaskRowList } from "@/components/tasks/task-row";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { NotesSection } from "@/components/notes/notes-section";
import { useCompanyNotes } from "@/lib/data/hooks/use-notes";
import { notesProvider } from "@/lib/data/providers";

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function initials(fullName: string) {
  return fullName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const { company, contacts, isLoading, notFound, refresh } = useCompany(id);
  const { workstreams, isLoading: workstreamsLoading, refresh: refreshWorkstreams } = useWorkstreams({ companyId: id });
  const { tasks, isLoading: tasksLoading, refresh: refreshTasks } = useTasks({ companyId: id });
  const { notes, refresh: refreshNotes } = useCompanyNotes(id);

  const [editOpen, setEditOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<ClientContact | undefined>(undefined);
  const [workstreamDialogOpen, setWorkstreamDialogOpen] = useState(false);
  const [applyTemplateOpen, setApplyTemplateOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);

  const budgetRollup = useMemo(
    () => computeBudgetRollup(workstreams.map((w) => w.budget)),
    [workstreams]
  );

  if (!user) return null;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (notFound || !company) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Link href="/dashboard/companies" className="text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
          Back to companies
        </Link>
        <p className="text-sm text-muted-foreground">
          This company doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
      </div>
    );
  }

  const canManage = canManageCompanies(user);

  function openAddContact() {
    setEditingContact(undefined);
    setContactDialogOpen(true);
  }

  function openEditContact(contact: ClientContact) {
    setEditingContact(contact);
    setContactDialogOpen(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href="/dashboard/companies" className="text-sm text-muted-foreground hover:underline w-fit">
          <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
          Back to companies
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-2xl font-semibold">{company.name}</h1>
            <CompanyStatusBadge status={company.status} />
            <Badge variant="neutral">{company.brand.name}</Badge>
          </div>
          {canManage && (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil /> Edit company
            </Button>
          )}
        </div>
        <ClientHealthSummary health={company.health} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Overview</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Service lines</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {company.serviceLines.length === 0 ? (
                  <span className="text-sm text-muted-foreground">None assigned</span>
                ) : (
                  company.serviceLines.map((sl) => (
                    <Badge key={sl.id} variant="neutral">
                      {sl.name}
                    </Badge>
                  ))
                )}
              </div>
            </div>
            <div>
              <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Primary contact</span>
              <p className="mt-1.5 text-sm">
                {company.primaryContact ? (
                  <>
                    {company.primaryContact.name}
                    {company.primaryContact.title && (
                      <span className="text-muted-foreground"> — {company.primaryContact.title}</span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">No primary contact set</span>
                )}
              </p>
            </div>
            <div>
              <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Contract start</span>
              <p className="mt-1.5 text-sm">{formatDate(company.contractStartDate)}</p>
            </div>
            <div>
              <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Renewal date</span>
              <p className="mt-1.5 text-sm">{formatDate(company.renewalDate)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assigned Corebridge X staff</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {company.assignedStaff.length === 0 ? (
              <p className="text-sm text-muted-foreground">No staff assigned yet.</p>
            ) : (
              company.assignedStaff.map((staff) => (
                <div key={staff.id} className="flex items-center gap-3">
                  <Avatar className="size-8">
                    <AvatarFallback className="text-xs">{initials(staff.fullName)}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{staff.fullName}</span>
                    <span className="text-xs text-muted-foreground capitalize">{staff.role}</span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="text-base">Workstreams</CardTitle>
          {canManageWorkstreams(user) && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setApplyTemplateOpen(true)}>
                <Sparkles /> Apply template
              </Button>
              <Button size="sm" variant="outline" onClick={() => setWorkstreamDialogOpen(true)}>
                <Plus /> Add workstream
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {!workstreamsLoading && workstreams.length === 0 ? (
            <p className="text-sm text-muted-foreground">No workstreams set up for this company yet.</p>
          ) : (
            workstreams.map((workstream, i) => (
              <div key={workstream.id}>
                {i > 0 && <Separator className="my-3" />}
                <Link
                  href={`/dashboard/workstreams/${workstream.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md py-1 hover:underline"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{workstream.name}</span>
                      <WorkstreamStatusBadge status={workstream.status} />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {workstream.serviceLine?.name ?? "No service line"} · Lead: {workstream.lead.fullName}
                    </span>
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:w-48">
                    <ChecklistProgress done={workstream.doneTaskCount} total={workstream.taskCount} />
                    <BudgetBarCompact budget={workstream.budget} />
                    {workstream.recurrence && <RecurrenceIndicatorCompact recurrence={workstream.recurrence} />}
                  </div>
                </Link>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {workstreams.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Time vs. Budget — All Workstreams</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <BudgetBar budget={budgetRollup} />
            {budgetRollup.workstreamsWithBudget < budgetRollup.totalWorkstreams && (
              <p className="text-xs text-muted-foreground">
                {budgetRollup.workstreamsWithBudget} of {budgetRollup.totalWorkstreams} workstreams have a budget set
                — expected hours above only totals those.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="text-base">Client contacts</CardTitle>
          {canManage && (
            <Button size="sm" variant="outline" onClick={openAddContact}>
              <Plus /> Add contact
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No contacts on file yet — these are reference-only and never log in.
            </p>
          ) : (
            contacts.map((contact, i) => (
              <div key={contact.id}>
                {i > 0 && <Separator className="my-3" />}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{contact.name}</span>
                      {contact.isPrimary && (
                        <Badge variant="info">
                          <Star className="size-3" aria-hidden="true" /> Primary
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {contact.title ?? "No title on file"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {contact.email ?? "No email"} · {contact.phone ?? "No phone"}
                    </span>
                  </div>
                  {canManage && (
                    <Button size="sm" variant="ghost" className="shrink-0" onClick={() => openEditContact(contact)}>
                      <Pencil /> Edit
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="text-base">Tasks</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setTaskDialogOpen(true)}
            disabled={workstreams.length === 0}
            title={workstreams.length === 0 ? "Add a workstream first to be able to add tasks." : undefined}
            data-shortcut="new-task"
          >
            <Plus /> Add task
          </Button>
        </CardHeader>
        <CardContent>
          {workstreams.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No workstreams yet — add one above before creating tasks for this company.
            </p>
          ) : (
            <TaskRowList tasks={tasks} isLoading={tasksLoading} emptyMessage="No tasks for this company yet." />
          )}
        </CardContent>
      </Card>

      <NotesSection
        title="Company Notes"
        description="Internal notes about this client — separate from task comments."
        notes={notes}
        emptyMessage="No notes on this company yet."
        onAddNote={async (input) => {
          await notesProvider.createCompanyNote(user, company.id, input);
          refreshNotes();
        }}
      />

      {canManage && (
        <>
          <CompanyFormDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            mode="edit"
            company={company}
            onSaved={refresh}
          />
          <ContactFormDialog
            open={contactDialogOpen}
            onOpenChange={setContactDialogOpen}
            companyId={company.id}
            contact={editingContact}
            onSaved={refresh}
          />
        </>
      )}
      {canManageWorkstreams(user) && (
        <>
          <WorkstreamFormDialog
            open={workstreamDialogOpen}
            onOpenChange={setWorkstreamDialogOpen}
            mode="create"
            company={company}
            onSaved={refreshWorkstreams}
          />
          <ApplyTemplateDialog
            open={applyTemplateOpen}
            onOpenChange={setApplyTemplateOpen}
            company={company}
            onApplied={() => {
              refreshWorkstreams();
              refreshTasks();
            }}
          />
        </>
      )}
      {workstreams.length > 0 && (
        <TaskFormDialog
          open={taskDialogOpen}
          onOpenChange={setTaskDialogOpen}
          mode="create"
          defaultWorkstreamId={workstreams[0].id}
          onSaved={refreshTasks}
        />
      )}
    </div>
  );
}
