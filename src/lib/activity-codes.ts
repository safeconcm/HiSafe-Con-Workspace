// src/lib/activity-codes.ts
// The 11 standardized Activity Codes from Section B of the official
// Timesheet paper form ("Time Allocation of Work on Project Tenders or for
// Other Cost Centers"). Labels are transcribed verbatim from the source PDF
// — including its own typos ("Bussiness", "Planing") — so anything that
// prints or displays these reads identically to the real form.
//
// 2026-10-20: pulled out as a shared constant while building the "Cost
// Centers" report (src/lib/payroll.ts's computeCostCenterSummary +
// src/app/access/cost-centers). Two older call sites —
// src/components/timesheet/TimesheetGrid.tsx (the data-entry dropdown) and
// src/lib/pdf/timesheet-official-form-template.ts (the PDF legend) — each
// already had their own independent copy of this same list before this file
// existed. Deliberately left those two as-is rather than refactoring them to
// import from here: they're shipped, working code with no bug to fix, and
// touching them now would only add commit-diff risk to an unrelated feature.
// Any new code (this report included) should import from here instead of
// adding a fourth copy.
export const ACTIVITY_CODE_LABELS: Record<string, string> = {
  '01': 'Pre-tendering/Tendering',
  '02': 'Design/Engineering',
  '03': 'Bussiness Development',
  '04': 'Project/Site Supervision',
  '05': 'Project/Site Administration',
  '06': 'Project/Site Management',
  '07': 'Project/Site Support and Planing',
  '08': 'Plant',
  '09': 'Safety',
  '10': 'General Administration Work',
  '11': 'Other Work',
}

export const ACTIVITY_CODE_ORDER = Object.keys(ACTIVITY_CODE_LABELS)

// Label shown for timesheet_lines rows with activity_code NULL/'' — i.e.
// hours logged before this classification existed, or a job-row the
// employee simply never set a code for. Not one of the 11 real codes, kept
// as its own bucket so it's obviously "needs follow-up" rather than quietly
// merged into code '11' ("Other Work").
export const UNCLASSIFIED_CODE  = 'unclassified'
export const UNCLASSIFIED_LABEL = 'ยังไม่ระบุ Activity Code'

export function activityCodeLabel(code: string | null | undefined): string {
  if (!code) return UNCLASSIFIED_LABEL
  return ACTIVITY_CODE_LABELS[code] ?? code
}
