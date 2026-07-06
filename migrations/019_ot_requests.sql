-- ============================================================
-- 019_ot_requests.sql
-- HiSafe-CON WorkSpace — OT (Overtime) Module
-- ============================================================

CREATE TYPE ot_status AS ENUM ('draft','pending','approved','rejected','cancelled');
CREATE TYPE ot_type   AS ENUM ('weekday','weekend','holiday');

CREATE TABLE ot_requests (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID         NOT NULL REFERENCES companies(id),
    user_id             UUID         NOT NULL REFERENCES users(id),
    ot_date             DATE         NOT NULL,
    ot_type             ot_type      NOT NULL DEFAULT 'weekday',
    start_time          TIME         NOT NULL,
    end_time            TIME         NOT NULL,
    -- Hours computed on submit
    total_hours         NUMERIC(4,2) NOT NULL DEFAULT 0 CHECK (total_hours > 0),
    job_id              UUID         REFERENCES jobs(id),
    reason              TEXT,
    status              ot_status    NOT NULL DEFAULT 'draft',
    current_approver_id UUID         REFERENCES users(id),
    approved_by_id      UUID         REFERENCES users(id),
    approved_at         TIMESTAMPTZ,
    rejected_by_id      UUID         REFERENCES users(id),
    rejected_at         TIMESTAMPTZ,
    rejection_reason    TEXT,
    cancelled_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_ot_time CHECK (end_time > start_time),
    -- Max OT 12 hours/day
    CONSTRAINT chk_ot_max  CHECK (total_hours <= 12)
);

CREATE TABLE ot_approvals (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    ot_request_id   UUID            NOT NULL REFERENCES ot_requests(id) ON DELETE CASCADE,
    approver_id     UUID            REFERENCES users(id),
    approver_name   VARCHAR(200),
    action          approval_action NOT NULL,
    comment         TEXT,
    sequence        INT             NOT NULL DEFAULT 1,
    acted_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ot_company    ON ot_requests (company_id);
CREATE INDEX idx_ot_user       ON ot_requests (user_id);
CREATE INDEX idx_ot_status     ON ot_requests (status);
CREATE INDEX idx_ot_approver   ON ot_requests (current_approver_id) WHERE current_approver_id IS NOT NULL;
CREATE INDEX idx_ot_date       ON ot_requests (ot_date);

ALTER TABLE ot_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ot_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY ot_select ON ot_requests FOR SELECT USING (
    company_id = current_company_id()
    AND (is_hr_or_admin() OR user_id = current_user_id() OR current_approver_id = current_user_id())
);
CREATE POLICY ot_insert ON ot_requests FOR INSERT WITH CHECK (
    company_id = current_company_id() AND user_id = current_user_id()
);
CREATE POLICY ot_update ON ot_requests FOR UPDATE USING (
    company_id = current_company_id()
    AND (is_hr_or_admin() OR user_id = current_user_id() OR current_approver_id = current_user_id())
);
CREATE POLICY ot_approvals_select ON ot_approvals FOR SELECT USING (
    EXISTS (SELECT 1 FROM ot_requests r WHERE r.id = ot_request_id AND r.company_id = current_company_id())
);

COMMENT ON TABLE ot_requests IS 'Overtime requests with approval workflow';
COMMENT ON COLUMN ot_requests.ot_type IS 'weekday=วันธรรมดา weekend=วันหยุดสุดสัปดาห์ holiday=วันหยุดนักขัตฤกษ์';
