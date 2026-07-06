-- ============================================================
-- 015_audit_logs.sql
-- HiSafe-CON WorkSpace
-- Immutable audit trail — every state change written here
-- Visible to HR and Admin in UI
-- ============================================================

CREATE TABLE audit_logs (
    -- BIGSERIAL: high volume, no need for UUID
    id              BIGSERIAL    PRIMARY KEY,
    company_id      UUID         NOT NULL,   -- no FK for performance; denormalized
    -- Actor (NULL = system job e.g. year-end carry forward)
    actor_id        UUID,
    actor_email     VARCHAR(200),            -- snapshot at time of action
    actor_role      user_role,               -- snapshot
    -- What happened
    action          VARCHAR(100) NOT NULL,   -- e.g. 'leave.approved', 'timesheet.rejected'
    entity_type     VARCHAR(100) NOT NULL,   -- 'leave_request' | 'timesheet' | 'leave_balance' | 'user' | ...
    entity_id       UUID,
    -- State change
    old_data        JSONB,                   -- before
    new_data        JSONB,                   -- after
    -- Request metadata
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Partial index: fast lookup for HR audit log viewer (filter by company + time)
CREATE INDEX idx_audit_company_time ON audit_logs (company_id, created_at DESC);
CREATE INDEX idx_audit_entity       ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_actor        ON audit_logs (actor_id) WHERE actor_id IS NOT NULL;

-- Partition by year for future scale (optional — can add later)
COMMENT ON TABLE  audit_logs             IS 'Immutable audit trail; every create/update/status-change is logged here';
COMMENT ON COLUMN audit_logs.action      IS 'Dot-notation action: leave.submitted, leave.approved, timesheet.rejected, user.created, balance.adjusted ...';
COMMENT ON COLUMN audit_logs.old_data    IS 'JSONB snapshot of entity state BEFORE the change';
COMMENT ON COLUMN audit_logs.new_data    IS 'JSONB snapshot of entity state AFTER the change';
COMMENT ON COLUMN audit_logs.actor_email IS 'Denormalized snapshot — preserved even if user is deleted';
