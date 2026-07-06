-- ============================================================
-- 009_leave_approvals.sql
-- HiSafe-CON WorkSpace
-- Immutable approval action log for each leave request
-- Every approve / reject / note is recorded here
-- ============================================================

CREATE TYPE approval_action AS ENUM (
    'approved',     -- approver approved
    'rejected',     -- approver rejected
    'noted',        -- HR noted (after final approval)
    'cancelled',    -- employee cancelled
    'auto_approved' -- CEO edge case: auto-approved by system
);

CREATE TABLE leave_approvals (
    id               UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    leave_request_id UUID            NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
    approver_id      UUID            REFERENCES users(id) ON DELETE SET NULL,
    approver_name    VARCHAR(200),   -- snapshot in case user is deleted
    action           approval_action NOT NULL,
    comment          TEXT,
    -- Which step in the chain (1 = supervisor, 2 = HR note, etc.)
    sequence         INT             NOT NULL DEFAULT 1,
    acted_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_leave_approval_req      ON leave_approvals (leave_request_id);
CREATE INDEX idx_leave_approval_approver ON leave_approvals (approver_id);

COMMENT ON TABLE  leave_approvals              IS 'Immutable log of every action taken on a leave request';
COMMENT ON COLUMN leave_approvals.approver_name IS 'Snapshot of approver name at time of action';
COMMENT ON COLUMN leave_approvals.sequence      IS '1=Supervisor 2=HR 99=System auto-approve';
