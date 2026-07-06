-- ============================================================
-- 007_leave_balances.sql
-- HiSafe-CON WorkSpace
-- Per-employee leave balance per type per year
-- Source of truth for "how many days left"
-- ============================================================

CREATE TABLE leave_balances (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id             UUID         NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    leave_type          leave_type   NOT NULL,
    year                INT          NOT NULL,
    -- Days granted at start of year (from seniority calc or policy)
    quota_days          NUMERIC(5,1) NOT NULL DEFAULT 0,
    -- Carried forward from previous year (annual only, max 7)
    carried_forward     NUMERIC(5,1) NOT NULL DEFAULT 0,
    -- HR manual adjustment (can be negative to deduct)
    adjusted_days       NUMERIC(5,1) NOT NULL DEFAULT 0,
    -- Deducted by approved leave requests
    used_days           NUMERIC(5,1) NOT NULL DEFAULT 0,
    -- Reserved by PENDING leave requests (not yet approved)
    pending_days        NUMERIC(5,1) NOT NULL DEFAULT 0,
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_balance_user_type_year UNIQUE (user_id, leave_type, year),
    CONSTRAINT chk_quota_nn              CHECK (quota_days     >= 0),
    CONSTRAINT chk_carried_nn            CHECK (carried_forward >= 0),
    CONSTRAINT chk_used_nn               CHECK (used_days       >= 0),
    CONSTRAINT chk_pending_nn            CHECK (pending_days    >= 0)
);

-- Available balance = quota + carried_forward + adjusted - used - pending
CREATE OR REPLACE VIEW leave_balance_summary AS
SELECT
    lb.id,
    lb.company_id,
    lb.user_id,
    u.employee_code,
    u.first_name_th,
    u.last_name_th,
    lb.leave_type,
    lb.year,
    lb.quota_days,
    lb.carried_forward,
    lb.adjusted_days,
    lb.used_days,
    lb.pending_days,
    GREATEST(
        lb.quota_days + lb.carried_forward + lb.adjusted_days
        - lb.used_days - lb.pending_days,
        0
    ) AS available_days
FROM leave_balances lb
JOIN users u ON u.id = lb.user_id;

CREATE INDEX idx_leave_balance_user_year   ON leave_balances (user_id, year);
CREATE INDEX idx_leave_balance_company     ON leave_balances (company_id, year);

COMMENT ON TABLE leave_balances                 IS 'Live leave balance per employee per type per year';
COMMENT ON COLUMN leave_balances.quota_days     IS 'Base quota: for annual = seniority calc; others = policy quota_days';
COMMENT ON COLUMN leave_balances.carried_forward IS 'From previous year end-of-year process, max 7 for annual';
COMMENT ON COLUMN leave_balances.adjusted_days  IS 'HR manual adjustment; can be negative';
COMMENT ON COLUMN leave_balances.pending_days   IS 'Sum of days from PENDING leave requests; released on approve/reject';
