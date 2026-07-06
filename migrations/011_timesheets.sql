-- ============================================================
-- 011_timesheets.sql
-- HiSafe-CON WorkSpace
-- Monthly timesheet header — one row per employee per month
-- ============================================================

CREATE TYPE timesheet_status AS ENUM (
    'draft',        -- employee editing
    'submitted',    -- waiting supervisor approval
    'approved',     -- supervisor approved
    'rejected'      -- supervisor rejected — returns to draft
);

CREATE TABLE timesheets (
    id                  UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID              NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    user_id             UUID              NOT NULL REFERENCES users(id)     ON DELETE RESTRICT,
    year                INT               NOT NULL CHECK (year >= 2020),
    month               INT               NOT NULL CHECK (month BETWEEN 1 AND 12),
    status              timesheet_status  NOT NULL DEFAULT 'draft',

    -- Running total updated on each line save
    total_hours         NUMERIC(6,2)      NOT NULL DEFAULT 0 CHECK (total_hours >= 0),

    -- Submit
    submitted_at        TIMESTAMPTZ,
    current_approver_id UUID              REFERENCES users(id) ON DELETE SET NULL,

    -- Approve
    approved_by_id      UUID              REFERENCES users(id) ON DELETE SET NULL,
    approved_at         TIMESTAMPTZ,

    -- Reject (returns to draft for resubmit)
    rejected_by_id      UUID              REFERENCES users(id) ON DELETE SET NULL,
    rejected_at         TIMESTAMPTZ,
    rejection_reason    TEXT,

    -- Generated PDF (after approval)
    pdf_url             TEXT,

    created_at          TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_timesheet_user_month UNIQUE (user_id, year, month)
);

CREATE INDEX idx_timesheet_company       ON timesheets (company_id, year, month);
CREATE INDEX idx_timesheet_user          ON timesheets (user_id, year, month);
CREATE INDEX idx_timesheet_status        ON timesheets (status);
CREATE INDEX idx_timesheet_approver      ON timesheets (current_approver_id) WHERE current_approver_id IS NOT NULL;

COMMENT ON TABLE  timesheets                     IS 'Monthly timesheet header — one per employee per month';
COMMENT ON COLUMN timesheets.total_hours         IS 'Sum of timesheet_lines.hours; updated by trigger on line save';
COMMENT ON COLUMN timesheets.current_approver_id IS 'Set when status=submitted; cleared on approve/reject';
