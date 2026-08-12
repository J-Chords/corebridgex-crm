"use client";

import { Plus, X } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMinutes } from "@/lib/format-minutes";
import { sumActivity, sumAllDepartments, sumDepartment } from "@/lib/data/client-report-totals";
import type { ClientReportDepartmentSection, ClientReportLineItem } from "@/lib/data/types";
import { cn } from "@/lib/utils";

function formatDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

interface ClientReportViewProps {
  departments: ClientReportDepartmentSection[];
  editable: boolean;
  onLineChange?: (deptIndex: number, activityIndex: number, lineIndex: number, patch: Partial<ClientReportLineItem>) => void;
  onRemoveLine?: (deptIndex: number, activityIndex: number, lineIndex: number) => void;
  onAddLine?: (deptIndex: number, activityIndex: number) => void;
  onRemoveSection?: (deptIndex: number, activityIndex: number) => void;
}

/**
 * ACAS-styled: one Card per department (the "section"), a plain table of Details/Date/Duration rows
 * grouped under a mono activity label within it, a department total row, and a grand total at the
 * end. Unlike the internal Accomplishments Report's ReportView, there's no exhaustive catalog walk —
 * `departments` only ever contains sections with actual work by construction (see
 * `computeDepartmentSections`). An activity *can* still be empty in the data — a manually added
 * section not yet filled in, or one emptied by deleting its last line — the caller is responsible
 * for pre-filtering those out via `visibleDepartments()` whenever `editable` is false (a non-owner's
 * read-only view, a finalized report, and print/PDF all pass an already-filtered array here), so a
 * reader or exported document never has an empty box to scroll past. The owner's own draft view
 * passes the full, unfiltered array, so an empty placeholder still shows for them to fill in.
 */
export function ClientReportView({
  departments,
  editable,
  onLineChange,
  onRemoveLine,
  onAddLine,
  onRemoveSection,
}: ClientReportViewProps) {
  if (departments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No work found for this range yet — use &quot;+ Add section&quot; to add something by hand.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {departments.map((dept, deptIndex) => (
        <Card key={dept.departmentId ?? "other"} id={`section-${dept.departmentId ?? "other"}`} className="scroll-mt-4 print:break-inside-avoid print:border-black/20 print:shadow-none">
          <CardHeader>
            <CardTitle className="text-base">{dept.departmentName}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {dept.activities.map((activity, activityIndex) => (
              <div key={activity.activityId ?? "untagged"} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
                    {activity.activityName}
                  </h4>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{formatMinutes(sumActivity(activity))}</span>
                    {editable && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="print:hidden"
                        aria-label={`Remove ${activity.activityName}`}
                        onClick={() => onRemoveSection?.(deptIndex, activityIndex)}
                      >
                        <X />
                      </Button>
                    )}
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Details</TableHead>
                      <TableHead className="w-28">Date</TableHead>
                      <TableHead className="w-24 text-right">Duration</TableHead>
                      {editable && <TableHead className="w-8 print:hidden" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activity.lineItems.map((item, lineIndex) => (
                      <TableRow key={item.id} className="print:break-inside-avoid">
                        <TableCell className="whitespace-normal">
                          {editable ? (
                            <Textarea
                              value={item.details}
                              onChange={(e) => onLineChange?.(deptIndex, activityIndex, lineIndex, { details: e.target.value })}
                              placeholder="What was done…"
                              rows={2}
                              className="text-sm print:hidden"
                            />
                          ) : (
                            <p className="text-sm whitespace-pre-wrap">{item.details || "—"}</p>
                          )}
                          {editable && (
                            <p className="hidden text-sm whitespace-pre-wrap text-foreground print:block">{item.details || "—"}</p>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {editable ? (
                            <Input
                              type="date"
                              value={item.date}
                              onChange={(e) => onLineChange?.(deptIndex, activityIndex, lineIndex, { date: e.target.value })}
                              className="print:hidden"
                            />
                          ) : (
                            formatDate(item.date)
                          )}
                          {editable && <span className="hidden text-foreground print:inline">{formatDate(item.date)}</span>}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {editable ? (
                            <Input
                              type="number"
                              min={0}
                              step={5}
                              value={item.minutes}
                              onChange={(e) =>
                                onLineChange?.(deptIndex, activityIndex, lineIndex, { minutes: Math.max(0, Number(e.target.value) || 0) })
                              }
                              className="text-right print:hidden"
                            />
                          ) : (
                            formatMinutes(item.minutes)
                          )}
                          {editable && <span className="hidden text-foreground print:inline">{formatMinutes(item.minutes)}</span>}
                        </TableCell>
                        {editable && (
                          <TableCell className="print:hidden">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              aria-label="Remove line"
                              onClick={() => onRemoveLine?.(deptIndex, activityIndex, lineIndex)}
                            >
                              <X />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                    {activity.lineItems.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={editable ? 4 : 3} className="text-sm text-muted-foreground">
                          Nothing added yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                {editable && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-fit print:hidden"
                    onClick={() => onAddLine?.(deptIndex, activityIndex)}
                  >
                    <Plus /> Add line
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
          <CardFooter className={cn("justify-end border-t bg-muted/40 py-3 font-mono text-sm font-semibold")}>
            {dept.departmentName} total: {formatMinutes(sumDepartment(dept))}
          </CardFooter>
        </Card>
      ))}

      <Card className="print:break-inside-avoid print:border-black/20 print:shadow-none">
        <CardFooter className="justify-end py-4 font-mono text-base font-bold">
          Grand total: {formatMinutes(sumAllDepartments(departments))}
        </CardFooter>
      </Card>
    </div>
  );
}
