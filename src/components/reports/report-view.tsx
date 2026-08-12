"use client";

import { Plus, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  completionPercent,
  countActivities,
  countCompleted,
  countDepartmentActivities,
  countDepartmentCompleted,
} from "@/lib/data/accomplishments-report-totals";
import { cn } from "@/lib/utils";
import type { AccomplishmentsReportActivityLine, AccomplishmentsReportBrandSection, ReportKind } from "@/lib/data/types";

interface ActivityTableRowProps {
  line: AccomplishmentsReportActivityLine;
  editable: boolean;
  showCompanyLabel: boolean;
  onToggle?: () => void;
  onDetailChange?: (value: string) => void;
  onRemove?: () => void;
}

/** The colored-left-accent convention already established for Daily Update entries, ported here: done reads as success-green, not-done as a plain neutral edge — a real-data-driven "scan the checklist" cue, applied to the first cell (not the `<tr>` itself, which renders left borders unreliably across browsers). `onRemove` — only ever present while editable — is this row's own way to be taken back out, the activity-level sibling of Client Report's per-activity remove button. */
function ActivityTableRow({ line, editable, showCompanyLabel, onToggle, onDetailChange, onRemove }: ActivityTableRowProps) {
  return (
    <TableRow className="align-top print:break-inside-avoid">
      <TableCell
        className={cn(
          "w-2/5 border-l-4 py-3 align-top print:border-black/20",
          line.done ? "border-l-success" : "border-l-transparent"
        )}
      >
        <div className="flex items-start gap-2.5">
          <Checkbox
            className="mt-0.5 print:hidden"
            checked={line.done}
            disabled={!editable}
            onCheckedChange={() => onToggle?.()}
            aria-label={line.activityName}
          />
          <span className="mt-0.5 hidden print:inline" aria-hidden="true">
            {line.done ? "☑" : "☐"}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className={cn("text-sm font-medium", !line.done && "text-muted-foreground")}>{line.activityName}</span>
            {showCompanyLabel && line.companyLabel && (
              <span className="text-xs text-muted-foreground">— {line.companyLabel}</span>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="py-3 align-top whitespace-normal">
        {editable ? (
          <Textarea
            value={line.detail}
            onChange={(e) => onDetailChange?.(e.target.value)}
            placeholder="What was done…"
            rows={2}
            className="text-sm print:hidden"
          />
        ) : (
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{line.detail || "—"}</p>
        )}
        {editable && <p className="hidden text-sm whitespace-pre-wrap text-foreground print:block">{line.detail || "—"}</p>}
      </TableCell>
      {editable && onRemove && (
        <TableCell className="py-3 align-top print:hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove ${line.activityName}`}
            onClick={onRemove}
          >
            <X />
          </Button>
        </TableCell>
      )}
    </TableRow>
  );
}

interface ActivityGroupProps {
  label: string;
  activities: AccomplishmentsReportActivityLine[];
  completed: number;
  total: number;
  editable: boolean;
  showCompanyLabel: boolean;
  onToggle: (activityIndex: number) => void;
  onDetailChange: (activityIndex: number, value: string) => void;
  onRemoveActivity?: (activityIndex: number) => void;
}

/** One department's (or the brand's "Other" bucket's) mono label + completion count + its own two-column table — the same "labeled group, then a real table" shape Client Reports uses per activity, one level up. */
function ActivityGroup({
  label,
  activities,
  completed,
  total,
  editable,
  showCompanyLabel,
  onToggle,
  onDetailChange,
  onRemoveActivity,
}: ActivityGroupProps) {
  const removable = editable && !!onRemoveActivity;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-mono text-xs tracking-wide text-muted-foreground uppercase">{label}</h3>
        <span className="font-mono text-xs text-muted-foreground">
          {completed}/{total}
        </span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-2/5">Activity</TableHead>
            <TableHead>Detail</TableHead>
            {removable && <TableHead className="w-8 print:hidden" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {activities.map((line, activityIndex) => (
            <ActivityTableRow
              key={line.activityId ?? "other"}
              line={line}
              editable={editable}
              showCompanyLabel={showCompanyLabel}
              onToggle={() => onToggle(activityIndex)}
              onDetailChange={(v) => onDetailChange(activityIndex, v)}
              onRemove={removable ? () => onRemoveActivity(activityIndex) : undefined}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface ReportViewProps {
  kind: ReportKind;
  brandSections: AccomplishmentsReportBrandSection[];
  editable: boolean;
  onToggleLine?: (brandIndex: number, departmentIndex: number | null, activityIndex: number) => void;
  onDetailChange?: (brandIndex: number, departmentIndex: number | null, activityIndex: number, value: string) => void;
  onAddService?: (brandIndex: number) => void;
  onRemoveActivity?: (brandIndex: number, departmentIndex: number, activityIndex: number) => void;
  onRemoveOther?: (brandIndex: number) => void;
}

/**
 * ACAS-styled, matching Client Reports' own layout: one Card per brand section (the "section"), a
 * real two-column table (Activity | Detail) per department, a per-section completion footer, and a
 * grand-total card at the end. Departments/activities only ever appear here with real evidence
 * behind them, or because the owner deliberately brought them in via "+ Add service" (one activity
 * at a time, the same granularity as Client Report's own "+ Add section") — never the brand's full
 * catalog (see `AccomplishmentsReportBrandSection`). The caller is responsible for pre-filtering via
 * `visibleBrandSections()` whenever `editable` is false, the same convention `ClientReportView`
 * already established, so a reader or exported document never has an empty box to scroll past. On
 * person reports, each activity also shows which client(s) the matched work was for — a client
 * report is already scoped to one client, so that label would be redundant there.
 */
export function ReportView({
  kind,
  brandSections,
  editable,
  onToggleLine,
  onDetailChange,
  onAddService,
  onRemoveActivity,
  onRemoveOther,
}: ReportViewProps) {
  const showCompanyLabel = kind === "person";

  if (brandSections.length === 0) {
    return <p className="text-sm text-muted-foreground">No brand-scoped work found for this range.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {brandSections.map((section, brandIndex) => (
        <Card
          key={section.brandId}
          id={`section-${section.brandId}`}
          className="scroll-mt-4 print:break-inside-avoid print:border-black/20 print:shadow-none"
        >
          <CardHeader>
            <CardTitle className="text-base">{section.brandName}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {section.departments.length === 0 && !section.otherIncluded && (
              <p className="text-xs text-muted-foreground">
                Nothing auto-detected for {section.brandName} yet — use &quot;+ Add service&quot; below to add one by
                hand.
              </p>
            )}
            {section.departments.map((dept, departmentIndex) => (
              <ActivityGroup
                key={dept.departmentId}
                label={dept.departmentName}
                activities={dept.activities}
                completed={countDepartmentCompleted(dept)}
                total={countDepartmentActivities(dept)}
                editable={editable}
                showCompanyLabel={showCompanyLabel}
                onToggle={(activityIndex) => onToggleLine?.(brandIndex, departmentIndex, activityIndex)}
                onDetailChange={(activityIndex, v) => onDetailChange?.(brandIndex, departmentIndex, activityIndex, v)}
                onRemoveActivity={(activityIndex) => onRemoveActivity?.(brandIndex, departmentIndex, activityIndex)}
              />
            ))}
            {section.otherIncluded && (
              <ActivityGroup
                label="Other"
                activities={[section.other]}
                completed={section.other.done ? 1 : 0}
                total={1}
                editable={editable}
                showCompanyLabel={showCompanyLabel}
                onToggle={() => onToggleLine?.(brandIndex, null, 0)}
                onDetailChange={(_activityIndex, v) => onDetailChange?.(brandIndex, null, 0, v)}
                onRemoveActivity={() => onRemoveOther?.(brandIndex)}
              />
            )}
            {editable && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit print:hidden"
                onClick={() => onAddService?.(brandIndex)}
              >
                <Plus /> Add service
              </Button>
            )}
          </CardContent>
          <CardFooter className="justify-end border-t bg-muted/40 py-3 font-mono text-sm font-semibold">
            {section.brandName}: {countCompleted([section])}/{countActivities([section])} completed
          </CardFooter>
        </Card>
      ))}

      <Card className="print:break-inside-avoid print:border-black/20 print:shadow-none">
        <CardFooter className="justify-end py-4 font-mono text-base font-bold">
          Grand total: {countCompleted(brandSections)}/{countActivities(brandSections)} completed (
          {completionPercent(brandSections)}%)
        </CardFooter>
      </Card>
    </div>
  );
}
