-- ============================================================
-- 013_timesheet_approvals.sql
-- HiSafe-CON WorkSpace
-- Immutable approval action log for each timesheet
-- ============================================================

CREATE TABLE timesheet_approvals (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    timesheet_id    UUID            NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
    approver_id     UUID            REFERENCES users(id) ON DELETE SET NULL,
    approver_name   VARCHAR(200),   -- snapshot
    action          approval_action NOT NULL,
    comment         TEXT,
    sequence        INT             NOT NULL DEFAULT 1,
    acted_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ts_approval_ts       ON timesheet_approvals (timesheet_id);
CREATE INDEX idx_ts_approval_approver ON timesheet_approvals (approver_id);

COMMENT ON TABLE timesheet_approvals IS 'Immutable log of every approve/reject action on a timesheet';
