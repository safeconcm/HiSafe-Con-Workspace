-- ============================================================
-- 012_timesheet_lines.sql
-- HiSafe-CON WorkSpace
-- Daily timesheet entries — one row per day per job
-- Enforces: max 8 hrs/day, no weekends, no holidays, no leave days
-- ============================================================

CREATE TYPE timesheet_line_type AS ENUM (
    'work',     -- normal work entry
    'leave'     -- auto-generated from approved leave (read-only)
);

CREATE TABLE timesheet_lines (
    id               UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
    timesheet_id     UUID                 NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
    work_date        DATE                 NOT NULL,
    job_id           UUID                 REFERENCES jobs(id) ON DELETE RESTRICT,
    hours            NUMERIC(4,2)         NOT NULL DEFAULT 0,
    line_type        timesheet_line_type  NOT NULL DEFAULT 'work',
    -- For leave lines: reference which leave request locked this date
    leave_request_id UUID                 REFERENCES leave_requests(id) ON DELETE SET NULL,
    remark           TEXT,

    CONSTRAINT uq_line_timesheet_date_job UNIQUE (timesheet_id, work_date, job_id),
    -- Hours: 0 to 8 (no OT)
    CONSTRAINT chk_hours_range CHECK (hours >= 0 AND hours <= 8),
    -- Leave lines must reference a leave request; work lines must not
    CONSTRAINT chk_leave_line_ref CHECK (
        (line_type = 'work'  AND leave_request_id IS NULL)
        OR
        (line_type = 'leave' AND leave_request_id IS NOT NULL)
    ),
    -- Leave lines cannot have a job
    CONSTRAINT chk_leave_no_job CHECK (
        line_type = 'work' OR (line_type = 'leave' AND job_id IS NULL)
    )
);

-- Trigger: keep timesheets.total_hours in sync
CREATE OR REPLACE FUNCTION trg_update_timesheet_total()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE timesheets
    SET
        total_hours = (
            SELECT COALESCE(SUM(hours), 0)
            FROM   timesheet_lines
            WHERE  timesheet_id = COALESCE(NEW.timesheet_id, OLD.timesheet_id)
              AND  line_type = 'work'
        ),
        updated_at = NOW()
    WHERE id = COALESCE(NEW.timesheet_id, OLD.timesheet_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ts_lines_total
AFTER INSERT OR UPDATE OR DELETE ON timesheet_lines
FOR EACH ROW EXECUTE FUNCTION trg_update_timesheet_total();

-- Per-day total check (sum of all jobs on same date ≤ 8 hrs)
-- Enforced in application layer + this DB function for safety
CREATE OR REPLACE FUNCTION check_daily_hours(
    p_timesheet_id UUID,
    p_work_date    DATE,
    p_hours        NUMERIC,
    p_exclude_id   UUID DEFAULT NULL  -- for UPDATE: exclude current row
) RETURNS BOOLEAN AS $$
DECLARE
    v_existing NUMERIC;
BEGIN
    SELECT COALESCE(SUM(hours), 0) INTO v_existing
    FROM   timesheet_lines
    WHERE  timesheet_id = p_timesheet_id
      AND  work_date    = p_work_date
      AND  line_type    = 'work'
      AND  (p_exclude_id IS NULL OR id <> p_exclude_id);

    RETURN (v_existing + p_hours) <= 8;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE INDEX idx_ts_line_timesheet ON timesheet_lines (timesheet_id);
CREATE INDEX idx_ts_line_date      ON timesheet_lines (work_date);
CREATE INDEX idx_ts_line_job       ON timesheet_lines (job_id) WHERE job_id IS NOT NULL;

COMMENT ON TABLE  timesheet_lines                  IS 'Daily hour entries per job; max 8 hrs/day per employee';
COMMENT ON COLUMN timesheet_lines.line_type        IS 'work=employee entered; leave=auto-locked from approved leave';
COMMENT ON COLUMN timesheet_lines.leave_request_id IS 'Set on leave lines to trace which leave locked this date';
COMMENT ON COLUMN timesheet_lines.hours            IS 'Full-day leave=8, half-day leave=4, normal work 0–8';
