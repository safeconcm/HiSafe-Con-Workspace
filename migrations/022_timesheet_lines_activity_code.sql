-- ============================================================
-- 022_timesheet_lines_activity_code.sql
-- HiSafe-CON WorkSpace
-- Backfill migration — documents a column that was already added directly
-- to the live database out-of-band (via Supabase SQL console) when the
-- Activity Code dropdown was built into TimesheetGrid.tsx, without ever
-- being captured as a checked-in migration. Discovered 2026-10-20 while
-- scoping the "Cost Centers" report (src/lib/payroll.ts's
-- computeCostCenterSummary): the application code in TimesheetGrid.tsx,
-- src/app/api/timesheet/[id]/route.ts, src/app/api/pdf/timesheet/[id]/
-- official/route.ts, and src/lib/pdf/timesheet-official-form-template.ts
-- all read/write timesheet_lines.activity_code as if it already existed,
-- but migrations/012_timesheet_lines.sql's CREATE TABLE never had it.
--
-- `IF NOT EXISTS` is used here (unlike the rest of this project's
-- migrations, which run once and don't guard) specifically because this
-- migration documents reality rather than introducing something new — it
-- must be a no-op wherever the column is already live, while still being
-- the thing that brings a fresh/rebuilt database up to the same schema.
--
-- One value per job-row per month (not per day) — see TimesheetGrid.tsx's
-- own comment — so this is stamped identically across every work line for
-- the same job within a timesheet; see check_daily_hours() in
-- 012_timesheet_lines.sql, unaffected by this column.
--
-- Codes are the 11 standardized Activity Codes transcribed verbatim from
-- the official paper Timesheet form (Section B) — see
-- src/lib/activity-codes.ts for the canonical label list ('01' through
-- '11'). Not a DB-level CHECK/ENUM on purpose: the dropdown already
-- constrains entry at the UI layer, and a free-text column is simpler to
-- extend if a 12th code is ever added later than a migration + enum change.
-- ============================================================

ALTER TABLE timesheet_lines
    ADD COLUMN IF NOT EXISTS activity_code VARCHAR(2);

COMMENT ON COLUMN timesheet_lines.activity_code IS
    'One of the 11 standardized Activity Codes (Section B of the official Timesheet form), entered once per job-row per month in TimesheetGrid.tsx; NULL = not yet classified. See src/lib/activity-codes.ts.';
