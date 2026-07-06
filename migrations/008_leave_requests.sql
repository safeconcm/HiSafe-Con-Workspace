-- ============================================================
-- 008_leave_requests.sql
-- HiSafe-CON WorkSpace
-- Leave request header — one row per leave submission
-- ============================================================

CREATE TYPE leave_status AS ENUM (
    'draft',            -- saved but not submitted
    'pending',          -- waiting for supervisor action
    'approved',         -- supervisor approved
    'rejected',         -- supervisor rejected
    'cancelled',        -- cancelled by employee (after approval needs re-approval flow)
    'cancel_pending'    -- cancellation request waiting supervisor approval
);

CREATE TABLE leave_requests (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID         NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    user_id             UUID         NOT NULL REFERENCES users(id)     ON DELETE RESTRICT,
    leave_type          leave_type   NOT NULL,
    status              leave_status NOT NULL DEFAULT 'draft',

    -- Date range
    start_date          DATE         NOT NULL,
    end_date            DATE         NOT NULL,

    -- Half-day support
    is_half_day         BOOLEAN      NOT NULL DEFAULT FALSE,
    half_day_period     VARCHAR(10)  CHECK (half_day_period IN ('morning', 'afternoon')),

    -- Computed on submit — excludes weekends and holidays
    total_days          NUMERIC(5,1) NOT NULL DEFAULT 0,

    reason              TEXT,
    attachment_url      TEXT,

    -- Approval chain
    current_approver_id UUID         REFERENCES users(id) ON DELETE SET NULL,

    -- Approve
    approved_by_id      UUID         REFERENCES users(id) ON DELETE SET NULL,
    approved_at         TIMESTAMPTZ,

    -- Reject
    rejected_by_id      UUID         REFERENCES users(id) ON DELETE SET NULL,
    rejected_at         TIMESTAMPTZ,
    rejection_reason    TEXT,

    -- Cancel
    cancelled_at        TIMESTAMPTZ,
    cancel_reason       TEXT,

    -- Generated PDF
    pdf_url             TEXT,

    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT chk_dates          CHECK (end_date >= start_date),
    CONSTRAINT chk_half_day_rules CHECK (
        is_half_day = FALSE
        OR (
            is_half_day = TRUE
            AND start_date = end_date
            AND half_day_period IS NOT NULL
        )
    ),
    CONSTRAINT chk_total_days     CHECK (total_days >= 0)
);

CREATE INDEX idx_leave_req_company     ON leave_requests (company_id);
CREATE INDEX idx_leave_req_user        ON leave_requests (user_id);
CREATE INDEX idx_leave_req_status      ON leave_requests (status);
CREATE INDEX idx_leave_req_approver    ON leave_requests (current_approver_id) WHERE current_approver_id IS NOT NULL;
CREATE INDEX idx_leave_req_dates       ON leave_requests (start_date, end_date);
CREATE INDEX idx_leave_req_type_year   ON leave_requests (user_id, leave_type, EXTRACT(YEAR FROM start_date)::INT);

COMMENT ON TABLE  leave_requests                    IS 'Leave request header one row per submission';
COMMENT ON COLUMN leave_requests.total_days         IS 'Computed on submit: excludes weekends and public holidays';
COMMENT ON COLUMN leave_requests.half_day_period    IS 'morning or afternoon; only set when is_half_day=true';
COMMENT ON COLUMN leave_requests.current_approver_id IS 'Who needs to action this request now';
COMMENT ON COLUMN leave_requests.status             IS 'State machine: draft→pending→approved/rejected; approved→cancel_pending→cancelled';
