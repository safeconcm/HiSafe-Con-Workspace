// src/types/database.ts
// TypeScript types that mirror the PostgreSQL schema exactly

export type UserRole = 'employee' | 'supervisor' | 'hr' | 'admin'
export type UserStatus = 'active' | 'inactive' | 'resigned'
// 2026-10-19: 'study' added — ลาศึกษา/อบรม, split out from 'other' so it has
// its own quota/policy and shows up separately in reports (see
// migrations run via Supabase MCP the same day: leave_policies/leave_balances
// seeded per company). Unlike probation-unpaid leave, study leave is still
// fully paid — but its days are excluded from the Job Cost rate denominator
// (see getUserRateForPeriod in src/lib/payroll.ts), which raises the
// effective daily/hourly rate charged to whatever Job the employee actually
// logged hours against during that pay cycle.
export type LeaveType = 'annual' | 'sick' | 'personal' | 'maternity' | 'other' | 'study'
export type LeaveStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'cancel_pending'
export type ApprovalAction =
  | 'approved'
  | 'rejected'
  | 'noted'
  | 'cancelled'
  | 'auto_approved'
  | 'reopened'
export type HolidayType = 'national' | 'company' | 'special'
export type JobStatus = 'active' | 'inactive' | 'closed'
export type TimesheetStatus = 'draft' | 'submitted' | 'approved' | 'rejected'
export type TimesheetLineType = 'work' | 'leave'
export type NotificationChannel = 'in_app' | 'email' | 'line'
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'read'
export type NotificationEvent =
  | 'leave_submitted'
  | 'leave_approved'
  | 'leave_rejected'
  | 'leave_cancelled'
  | 'leave_cancel_requested'
  | 'leave_balance_adjusted'
  | 'timesheet_submitted'
  | 'timesheet_approved'
  | 'timesheet_rejected'
  | 'timesheet_reopened'
  | 'comp_work_submitted'
  | 'comp_work_approved'
  | 'comp_work_rejected'
  | 'salary_adjusted'
  | 'general'

// ── Tables ──────────────────────────────────────────────────

export interface Company {
  id: string
  code: string
  name_th: string
  name_en: string
  logo_url: string | null
  // Letterhead fields for PDF documents (see src/lib/pdf/company-letterhead.ts)
  // — distinct from name_th, which stays the short display name used in
  // nav/UI (e.g. "เซฟคอน" vs. the full "บริษัท เซฟคอน จำกัด").
  legal_name_th: string | null
  address_th: string | null
  tax_id: string | null
  phone: string | null
  contact_email: string | null
  line_oa_channel_id: string | null
  line_oa_channel_secret: string | null
  line_oa_access_token: string | null
  smtp_host: string | null
  smtp_port: number
  smtp_user: string | null
  smtp_password: string | null
  smtp_from: string | null
  smtp_from_name: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface User {
  id: string
  company_id: string
  employee_code: string
  auth_user_id: string | null
  email: string | null
  first_name_th: string
  last_name_th: string
  first_name_en: string | null
  last_name_en: string | null
  position_th: string | null
  position_en: string | null
  department: string | null
  role: UserRole
  status: UserStatus
  hire_date: string
  resign_date: string | null
  avatar_url: string | null
  phone: string | null
  imported_at: string | null
  created_at: string
  updated_at: string
}

export interface OrganizationNode {
  id: string
  company_id: string
  user_id: string
  parent_id: string | null
  depth: number
  acting_approver_id: string | null
  is_active: boolean
  effective_from: string
  effective_to: string | null
  created_at: string
  updated_at: string
}

export interface Holiday {
  id: string
  company_id: string
  holiday_date: string
  name_th: string
  name_en: string | null
  type: HolidayType
  year: number
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface LeavePolicy {
  id: string
  company_id: string
  leave_type: LeaveType
  year: number
  quota_days: number
  carry_forward_max: number
  allow_half_day: boolean
  require_document_after_days: number
  min_days_notice: number
  description_th: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface LeaveBalance {
  id: string
  company_id: string
  user_id: string
  leave_type: LeaveType
  year: number
  quota_days: number
  carried_forward: number
  adjusted_days: number
  used_days: number
  pending_days: number
  updated_at: string
}

export interface LeaveBalanceSummary extends LeaveBalance {
  employee_code: string
  first_name_th: string
  last_name_th: string
  available_days: number
}

export interface LeaveRequest {
  id: string
  company_id: string
  user_id: string
  leave_type: LeaveType
  status: LeaveStatus
  start_date: string
  end_date: string
  is_half_day: boolean
  half_day_period: 'morning' | 'afternoon' | null
  total_days: number
  reason: string | null
  attachment_url: string | null
  current_approver_id: string | null
  approved_by_id: string | null
  approved_at: string | null
  rejected_by_id: string | null
  rejected_at: string | null
  rejection_reason: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  pdf_url: string | null
  signature_employee_url: string | null
  signature_employee_at: string | null
  signature_hr_url: string | null
  signature_hr_at: string | null
  created_at: string
  updated_at: string
}

export interface LeaveApproval {
  id: string
  leave_request_id: string
  approver_id: string | null
  approver_name: string | null
  action: ApprovalAction
  comment: string | null
  sequence: number
  acted_at: string
}

export interface Job {
  id: string
  company_id: string
  job_code: string
  name_th: string
  name_en: string | null
  year: number
  status: JobStatus
  description: string | null
  client_name: string | null
  // มูลค่างาน/วันที่เริ่ม-สิ้นสุด/ลำดับ (2026-10-21) — all optional, filled in
  // after the Job already exists; contract_value feeds the revenue summary
  // (src/app/api/admin/jobs/revenue-summary/route.ts), sequence_no is a
  // free-form display-order number (NOT a unique key — see migration comment).
  contract_value: number | null
  start_date: string | null
  end_date: string | null
  sequence_no: number | null
  // Contract No./PO. (2026-10-21, "ต้องเพิ่มใส่ Contract No./PO.") — free-text,
  // optional; the client's own contract/PO reference number, not a system id.
  contract_no: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Timesheet {
  id: string
  company_id: string
  user_id: string
  year: number
  month: number
  status: TimesheetStatus
  total_hours: number
  submitted_at: string | null
  current_approver_id: string | null
  approved_by_id: string | null
  approved_at: string | null
  rejected_by_id: string | null
  rejected_at: string | null
  rejection_reason: string | null
  reopened_at: string | null
  reopened_by_id: string | null
  reopen_reason: string | null
  pdf_url: string | null
  created_at: string
  updated_at: string
}

export interface TimesheetLine {
  id: string
  timesheet_id: string
  work_date: string
  job_id: string | null
  hours: number
  line_type: TimesheetLineType
  leave_request_id: string | null
  remark: string | null
  // One of the 11 standardized Activity Codes (Section B of the official
  // Timesheet form) — see src/lib/activity-codes.ts. Added to this shared
  // type 2026-10-20; the column itself existed live in the DB earlier than
  // that (see migrations/022_timesheet_lines_activity_code.sql's comment)
  // but was missing here, so TimesheetGrid.tsx/the two API routes that
  // already read/write it each had their own ad-hoc local type instead.
  activity_code: string | null
}

export interface Notification {
  id: string
  company_id: string
  recipient_id: string
  channel: NotificationChannel
  event_type: NotificationEvent
  title: string
  body: string
  reference_id: string | null
  reference_type: 'leave_request' | 'timesheet' | 'leave_balance' | null
  status: NotificationStatus
  retry_count: number
  max_retries: number
  last_error: string | null
  read_at: string | null
  sent_at: string | null
  next_retry_at: string | null
  created_at: string
}

export interface AuditLog {
  id: number
  company_id: string
  actor_id: string | null
  actor_email: string | null
  actor_role: UserRole | null
  action: string
  entity_type: string
  entity_id: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

// ── Enriched / joined types used in UI ───────────────────────

export interface LeaveRequestWithUser extends LeaveRequest {
  user: Pick<User, 'id' | 'employee_code' | 'first_name_th' | 'last_name_th' | 'avatar_url'>
  approver?: Pick<User, 'id' | 'first_name_th' | 'last_name_th'> | null
}

export interface TimesheetWithUser extends Timesheet {
  user: Pick<User, 'id' | 'employee_code' | 'first_name_th' | 'last_name_th'>
}

export interface OrgNodeWithUser extends OrganizationNode {
  user: User
  children?: OrgNodeWithUser[]
}

// ── Auth session payload ─────────────────────────────────────

export interface SessionUser {
  id: string           // users.id
  auth_user_id: string // supabase auth uid
  company_id: string
  company_code: string
  employee_code: string
  email: string
  first_name_th: string
  last_name_th: string
  role: UserRole
  avatar_url: string | null
  // True for management/executive users (e.g. the MD) who hold a
  // people-management role (supervisor/hr/admin) but, per company policy,
  // don't submit their own leave/timesheet through the system. Independent
  // of `role` — a supervisor can be a regular department manager (has
  // personal leave/timesheet) or an executive (doesn't), see Sidebar.tsx /
  // dashboard/page.tsx.
  is_executive: boolean
  // True only if this user has their own active organization_nodes row
  // with parent_id IS NULL — literally sits at the top of the org tree
  // (2026-10-20, "ข้อ 1": MD dashboard). See isOrgRoot() in api-helpers.ts
  // for why this is deliberately NOT the same thing as is_executive above.
  // Computed once per page load in (dashboard)/layout.tsx; defaults to
  // false anywhere a SessionUser is built without that extra query (e.g.
  // getSessionFromHeaders' header-only fallback) — safe, since it only
  // ever hides the MD-dashboard nav link / page content, nothing else.
  is_org_root?: boolean
  // Companies this auth user has an active profile in (for admins linked
  // to more than one company). Length 1 for normal single-company users.
  available_companies?: { id: string; code: string; name_th: string; logo_url: string | null }[]
}
