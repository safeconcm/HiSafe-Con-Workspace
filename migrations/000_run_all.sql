-- ============================================================
-- HiSafe-CON WorkSpace — COMPLETE DATABASE SETUP v6
-- รันใน Supabase SQL Editor ครั้งเดียว (สำหรับ DB ใหม่)
-- ⚠️  ถ้ามี DB อยู่แล้ว ให้รันทีละไฟล์ตามลำดับแทน
-- ============================================================

-- ════════════════════════════════════════════════════════
-- 001_companies.sql
-- ════════════════════════════════════════════════════════
-- ============================================================
-- 001_companies.sql
-- HiSafe-CON WorkSpace
-- Multi-tenant root table
-- ============================================================

CREATE TABLE companies (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    code                    VARCHAR(20) NOT NULL UNIQUE,
    name_th                 VARCHAR(200) NOT NULL,
    name_en                 VARCHAR(200) NOT NULL,
    logo_url                TEXT,
    -- LINE OA (shared 1 channel across both companies)
    line_oa_channel_id      VARCHAR(100),
    line_oa_channel_secret  VARCHAR(100),
    line_oa_access_token    TEXT,
    -- SMTP per company
    smtp_host               VARCHAR(200),
    smtp_port               INT         NOT NULL DEFAULT 587,
    smtp_user               VARCHAR(200),
    smtp_password           TEXT,
    smtp_from               VARCHAR(200),
    smtp_from_name          VARCHAR(200),
    is_active               BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  companies                     IS 'Tenant registry — Safecon and Highcon';
COMMENT ON COLUMN companies.code                IS 'Short code e.g. SAFECON, HIGHCON';
COMMENT ON COLUMN companies.line_oa_access_token IS 'LINE Messaging API channel access token';

-- Seed data
INSERT INTO companies (code, name_th, name_en)
VALUES
    ('SAFECON', 'เซฟคอน', 'Safecon'),
    ('HIGHCON', 'ไฮคอน',  'Highcon');


-- ════════════════════════════════════════════════════════
-- 002_users.sql
-- ════════════════════════════════════════════════════════
-- ============================================================
-- 002_users.sql
-- HiSafe-CON WorkSpace
-- All employees for both companies
-- ============================================================

CREATE TYPE user_role AS ENUM ('employee', 'supervisor', 'hr', 'admin');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'resigned');

CREATE TABLE users (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID         NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    employee_code   VARCHAR(50)  NOT NULL,
    -- Supabase Auth linkage (auth.users.id)
    auth_user_id    UUID         UNIQUE,
    email           VARCHAR(200) NOT NULL UNIQUE,
    first_name_th   VARCHAR(100) NOT NULL,
    last_name_th    VARCHAR(100) NOT NULL,
    first_name_en   VARCHAR(100),
    last_name_en    VARCHAR(100),
    position_th     VARCHAR(200),
    position_en     VARCHAR(200),
    department      VARCHAR(200),
    role            user_role    NOT NULL DEFAULT 'employee',
    status          user_status  NOT NULL DEFAULT 'active',
    hire_date       DATE         NOT NULL,
    resign_date     DATE,
    avatar_url      TEXT,
    phone           VARCHAR(20),
    -- import tracking
    imported_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_company_emp_code UNIQUE (company_id, employee_code),
    CONSTRAINT chk_resign_date     CHECK (resign_date IS NULL OR resign_date >= hire_date)
);

CREATE INDEX idx_users_company    ON users (company_id);
CREATE INDEX idx_users_auth       ON users (auth_user_id);
CREATE INDEX idx_users_email      ON users (email);
CREATE INDEX idx_users_status     ON users (company_id, status);

COMMENT ON TABLE  users              IS 'All employees for Safecon and Highcon';
COMMENT ON COLUMN users.auth_user_id IS 'FK to Supabase auth.users(id)';
COMMENT ON COLUMN users.role         IS 'employee | supervisor | hr | admin';


-- ════════════════════════════════════════════════════════
-- 003_user_line_accounts.sql
-- ════════════════════════════════════════════════════════
-- ============================================================
-- 003_user_line_accounts.sql
-- HiSafe-CON WorkSpace
-- LINE User ID mapping for personal push notifications
-- ============================================================

CREATE TABLE user_line_accounts (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID         NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    line_user_id    VARCHAR(100) NOT NULL UNIQUE,
    display_name    VARCHAR(200),
    picture_url     TEXT,
    linked_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_line_accounts_user ON user_line_accounts (user_id);

COMMENT ON TABLE  user_line_accounts              IS 'LINE User ID linked to each employee for personal push';
COMMENT ON COLUMN user_line_accounts.line_user_id IS 'LINE userId from LIFF login or webhook event';


-- ════════════════════════════════════════════════════════
-- 004_organization_nodes.sql
-- ════════════════════════════════════════════════════════
-- ============================================================
-- 004_organization_nodes.sql
-- HiSafe-CON WorkSpace
-- Self-referencing org hierarchy tree
-- Supports auto-approver routing and acting delegation
-- ============================================================

CREATE TABLE organization_nodes (
    id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID    NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    user_id             UUID    NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
    -- NULL parent_id = top of tree (CEO)
    parent_id           UUID    REFERENCES organization_nodes(id) ON DELETE SET NULL,
    -- 0 = CEO, 1 = MD, 2 = Manager, 3 = Supervisor, 4 = Employee
    depth               INT     NOT NULL DEFAULT 0 CHECK (depth >= 0),
    -- When this user is on leave, route approvals here
    acting_approver_id  UUID    REFERENCES users(id) ON DELETE SET NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    effective_from      DATE    NOT NULL DEFAULT CURRENT_DATE,
    effective_to        DATE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_not_own_parent      CHECK (parent_id <> id),
    CONSTRAINT chk_not_own_acting      CHECK (acting_approver_id <> user_id),
    CONSTRAINT chk_effective_dates     CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE INDEX idx_org_company    ON organization_nodes (company_id);
CREATE INDEX idx_org_parent     ON organization_nodes (parent_id);
CREATE INDEX idx_org_user       ON organization_nodes (user_id);
CREATE INDEX idx_org_active     ON organization_nodes (company_id, is_active);

COMMENT ON TABLE  organization_nodes                    IS 'Company org tree — self-referencing hierarchy';
COMMENT ON COLUMN organization_nodes.depth              IS '0=CEO 1=MD 2=Manager 3=Supervisor 4=Employee';
COMMENT ON COLUMN organization_nodes.acting_approver_id IS 'Delegate approvals to this user when absent';
COMMENT ON COLUMN organization_nodes.parent_id          IS 'NULL means top of tree (no approver above)';


-- ════════════════════════════════════════════════════════
-- 005_holidays.sql
-- ════════════════════════════════════════════════════════
-- ============================================================
-- 005_holidays.sql
-- HiSafe-CON WorkSpace
-- Company holiday calendar — scoped per company per year
-- HR manages via UI; blocks timesheet entry and counts leave days
-- ============================================================

CREATE TYPE holiday_type AS ENUM ('national', 'company', 'special');

CREATE TABLE holidays (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    holiday_date    DATE         NOT NULL,
    name_th         VARCHAR(200) NOT NULL,
    name_en         VARCHAR(200),
    type            holiday_type NOT NULL DEFAULT 'national',
    -- Computed & stored for fast year-based queries
    year            INT          NOT NULL GENERATED ALWAYS AS (EXTRACT(YEAR FROM holiday_date)::INT) STORED,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_by      UUID         REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_company_holiday_date UNIQUE (company_id, holiday_date)
);

CREATE INDEX idx_holidays_company_year ON holidays (company_id, year);
CREATE INDEX idx_holidays_date         ON holidays (holiday_date);

COMMENT ON TABLE  holidays      IS 'Company-specific holiday calendar; blocks timesheet and excludes from leave day count';
COMMENT ON COLUMN holidays.year IS 'Computed from holiday_date; used for fast annual queries';
COMMENT ON COLUMN holidays.type IS 'national=วันหยุดราชการ company=วันหยุดบริษัท special=กรณีพิเศษ';


-- ════════════════════════════════════════════════════════
-- 006_leave_policies.sql
-- ════════════════════════════════════════════════════════
-- ============================================================
-- 006_leave_policies.sql
-- HiSafe-CON WorkSpace
-- Leave quota rules per company per leave type per year
-- HR configures these; system derives leave_balances from them
-- ============================================================

CREATE TYPE leave_type AS ENUM (
    'annual',       -- พักร้อน (seniority-based 6–10 days)
    'sick',         -- ป่วย (30 days by law)
    'personal',     -- กิจธุระ (5 days)
    'maternity',    -- ลาคลอด (98 days)
    'other'         -- อื่นๆ (HR-defined)
);

CREATE TABLE leave_policies (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    leave_type          leave_type   NOT NULL,
    year                INT          NOT NULL,
    -- For 'annual': quota is computed per-employee via seniority
    -- For others: quota is fixed for all employees
    quota_days          NUMERIC(5,1) NOT NULL DEFAULT 0,
    carry_forward_max   NUMERIC(5,1) NOT NULL DEFAULT 0,
    allow_half_day      BOOLEAN      NOT NULL DEFAULT TRUE,
    -- Require doctor certificate after N consecutive sick days
    require_document_after_days INT  NOT NULL DEFAULT 0,
    -- Minimum advance notice in calendar days
    min_days_notice     INT          NOT NULL DEFAULT 0,
    description_th      TEXT,
    is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
    created_by          UUID         REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_policy_company_type_year UNIQUE (company_id, leave_type, year),
    CONSTRAINT chk_quota_positive          CHECK (quota_days >= 0),
    CONSTRAINT chk_carry_forward_positive  CHECK (carry_forward_max >= 0)
);

CREATE INDEX idx_leave_policies_company_year ON leave_policies (company_id, year);

-- ----------------------------------------------------------------
-- Seed default policies for 2025 and 2026
-- Annual leave quota is per-employee (seniority), so quota_days=0
-- Actual quota stored in leave_balances after seniority calculation
-- ----------------------------------------------------------------
DO $$
DECLARE
    v_company RECORD;
    v_year    INT;
BEGIN
    FOR v_company IN SELECT id FROM companies LOOP
        FOR v_year IN 2025..2026 LOOP
            INSERT INTO leave_policies
                (company_id, leave_type, year, quota_days, carry_forward_max,
                 allow_half_day, require_document_after_days, min_days_notice, description_th)
            VALUES
                -- Annual leave: quota per employee via seniority (calc_annual_leave_quota fn)
                (v_company.id, 'annual',    v_year,  0,  7, TRUE,  0, 1,
                 'ปีที่ 1=6วัน, ปีที่ 2=7วัน, ..., ปีที่ 5+=10วัน, สะสมได้สูงสุด 7 วัน'),
                -- Sick leave: 30 days by Thai labour law
                (v_company.id, 'sick',      v_year, 30,  0, TRUE,  3, 0,
                 'ลาป่วยตามกฎหมายแรงงาน 30 วัน/ปี, เกิน 3 วันติดต้องมีใบรับรองแพทย์'),
                -- Personal leave: 5 days
                (v_company.id, 'personal',  v_year,  5,  0, TRUE,  0, 1,
                 'ลากิจ 5 วัน/ปี'),
                -- Maternity leave: 98 days by Thai labour law
                (v_company.id, 'maternity', v_year, 98,  0, FALSE, 0, 0,
                 'ลาคลอด 98 วัน ตามกฎหมาย'),
                -- Other: HR configures as needed
                (v_company.id, 'other',     v_year,  0,  0, TRUE,  0, 0,
                 'กรณีพิเศษตามที่ HR กำหนด')
            ON CONFLICT DO NOTHING;
        END LOOP;
    END LOOP;
END $$;

COMMENT ON TABLE  leave_policies                           IS 'Leave quota rules per company per type per year';
COMMENT ON COLUMN leave_policies.quota_days               IS 'For annual leave this is 0; actual quota in leave_balances via seniority calc';
COMMENT ON COLUMN leave_policies.carry_forward_max        IS 'Max days that can carry forward to next year (annual=7, others=0)';
COMMENT ON COLUMN leave_policies.require_document_after_days IS 'Sick cert required if consecutive sick days > this value';


-- ════════════════════════════════════════════════════════
-- 007_leave_balances.sql
-- ════════════════════════════════════════════════════════
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


-- ════════════════════════════════════════════════════════
-- 008_leave_requests.sql
-- ════════════════════════════════════════════════════════
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


-- ════════════════════════════════════════════════════════
-- 009_leave_approvals.sql
-- ════════════════════════════════════════════════════════
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


-- ════════════════════════════════════════════════════════
-- 010_jobs.sql
-- ════════════════════════════════════════════════════════
-- ============================================================
-- 010_jobs.sql
-- HiSafe-CON WorkSpace
-- Job code catalogue — scoped per company per year
-- No sharing between Safecon and Highcon
-- ============================================================

CREATE TYPE job_status AS ENUM ('active', 'inactive', 'closed');

CREATE TABLE jobs (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    job_code        VARCHAR(50)  NOT NULL,
    name_th         VARCHAR(300) NOT NULL,
    name_en         VARCHAR(300),
    year            INT          NOT NULL,
    status          job_status   NOT NULL DEFAULT 'active',
    description     TEXT,
    client_name     VARCHAR(200),
    created_by      UUID         REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- Job code unique within a company+year
    CONSTRAINT uq_job_company_code_year UNIQUE (company_id, job_code, year)
);

CREATE INDEX idx_jobs_company_year ON jobs (company_id, year);
CREATE INDEX idx_jobs_status       ON jobs (company_id, status, year);

COMMENT ON TABLE  jobs            IS 'Job code catalogue per company per year; no cross-company sharing';
COMMENT ON COLUMN jobs.year       IS 'Fiscal/calendar year the job belongs to';
COMMENT ON COLUMN jobs.status     IS 'active=กำลังดำเนินการ inactive=พักไว้ closed=ปิดแล้ว';
COMMENT ON COLUMN jobs.job_code   IS 'e.g. JOB001, PRJ-2026-001 — unique within company+year';


-- ════════════════════════════════════════════════════════
-- 011_timesheets.sql
-- ════════════════════════════════════════════════════════
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


-- ════════════════════════════════════════════════════════
-- 012_timesheet_lines.sql
-- ════════════════════════════════════════════════════════
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


-- ════════════════════════════════════════════════════════
-- 013_timesheet_approvals.sql
-- ════════════════════════════════════════════════════════
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


-- ════════════════════════════════════════════════════════
-- 014_notifications.sql
-- ════════════════════════════════════════════════════════
-- ============================================================
-- 014_notifications.sql
-- HiSafe-CON WorkSpace
-- Notification queue for in-app, email, and LINE OA
-- Each channel gets its own row — allows per-channel retry
-- ============================================================

CREATE TYPE notification_channel AS ENUM ('in_app', 'email', 'line');
CREATE TYPE notification_status  AS ENUM ('pending', 'sent', 'failed', 'read');
CREATE TYPE notification_event   AS ENUM (
    'leave_submitted',
    'leave_approved',
    'leave_rejected',
    'leave_cancelled',
    'leave_cancel_requested',
    'leave_balance_adjusted',
    'timesheet_submitted',
    'timesheet_approved',
    'timesheet_rejected',
    'general'
);

CREATE TABLE notifications (
    id              UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID                  NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    recipient_id    UUID                  NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
    channel         notification_channel  NOT NULL,
    event_type      notification_event    NOT NULL,
    title           VARCHAR(300)          NOT NULL,
    body            TEXT                  NOT NULL,
    -- Deep link: which entity triggered this notification
    reference_id    UUID,
    reference_type  VARCHAR(50)           CHECK (reference_type IN ('leave_request', 'timesheet', 'leave_balance')),
    status          notification_status   NOT NULL DEFAULT 'pending',
    retry_count     INT                   NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    max_retries     INT                   NOT NULL DEFAULT 3,
    last_error      TEXT,
    -- Timestamps
    read_at         TIMESTAMPTZ,
    sent_at         TIMESTAMPTZ,
    next_retry_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_recipient        ON notifications (recipient_id, status);
CREATE INDEX idx_notif_company          ON notifications (company_id);
CREATE INDEX idx_notif_pending          ON notifications (status, next_retry_at) WHERE status IN ('pending', 'failed');
CREATE INDEX idx_notif_in_app_unread    ON notifications (recipient_id, created_at DESC)
    WHERE channel = 'in_app' AND status <> 'read';

COMMENT ON TABLE  notifications               IS 'Per-channel notification queue with retry support';
COMMENT ON COLUMN notifications.channel       IS 'in_app | email | line — one row per channel per event';
COMMENT ON COLUMN notifications.reference_id  IS 'UUID of the related leave_request or timesheet';
COMMENT ON COLUMN notifications.next_retry_at IS 'Set by worker after failed send; NULL = ready to process now';
COMMENT ON COLUMN notifications.max_retries   IS 'Give up after this many failures';


-- ════════════════════════════════════════════════════════
-- 015_audit_logs.sql
-- ════════════════════════════════════════════════════════
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


-- ════════════════════════════════════════════════════════
-- 016_functions.sql
-- ════════════════════════════════════════════════════════
-- ============================================================
-- 016_functions.sql
-- HiSafe-CON WorkSpace
-- Core business logic functions
-- ============================================================

-- ----------------------------------------------------------------
-- F1: Calculate annual leave quota from seniority
-- Input: hire_date, year to calculate for
-- Output: quota days (6,7,8,9, or 10)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION calc_annual_leave_quota(
    p_hire_date DATE,
    p_year      INT
) RETURNS NUMERIC AS $$
DECLARE
    v_years NUMERIC;
BEGIN
    -- Years of service as of Dec 31 of the target year
    v_years := DATE_PART('year', AGE(make_date(p_year, 12, 31), p_hire_date));
    RETURN CASE
        WHEN v_years < 1  THEN 0
        WHEN v_years < 2  THEN 6
        WHEN v_years < 3  THEN 7
        WHEN v_years < 4  THEN 8
        WHEN v_years < 5  THEN 9
        ELSE 10
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calc_annual_leave_quota IS
    'Returns annual leave quota (days) based on years of service. '
    'Year 1=6d, Year 2=7d, ..., Year 5+=10d (max).';


-- ----------------------------------------------------------------
-- F2: Count working days between two dates (excl. weekends & holidays)
-- Used to populate leave_requests.total_days on submit
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION calc_leave_days(
    p_company_id UUID,
    p_start_date DATE,
    p_end_date   DATE,
    p_is_half_day BOOLEAN DEFAULT FALSE
) RETURNS NUMERIC AS $$
DECLARE
    v_days   NUMERIC := 0;
    v_cursor DATE    := p_start_date;
BEGIN
    IF p_is_half_day THEN
        RETURN 0.5;
    END IF;

    WHILE v_cursor <= p_end_date LOOP
        -- Skip weekends (0=Sun, 6=Sat)
        IF EXTRACT(DOW FROM v_cursor) NOT IN (0, 6) THEN
            -- Skip holidays
            IF NOT EXISTS (
                SELECT 1 FROM holidays
                WHERE company_id  = p_company_id
                  AND holiday_date = v_cursor
                  AND is_active    = TRUE
            ) THEN
                v_days := v_days + 1;
            END IF;
        END IF;
        v_cursor := v_cursor + INTERVAL '1 day';
    END LOOP;

    RETURN v_days;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION calc_leave_days IS
    'Count working days in range excluding weekends and company holidays. '
    'Returns 0.5 for half-day leaves.';


-- ----------------------------------------------------------------
-- F3: Find the next available approver for a user
-- Walks up the org tree, skips nodes on approved leave,
-- falls back to acting_approver_id if set.
-- Returns NULL if user is at top (CEO) → auto-approve.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION find_approver(
    p_user_id    UUID,
    p_start_date DATE,
    p_end_date   DATE
) RETURNS UUID AS $$
DECLARE
    v_current_user_id UUID := p_user_id;
    v_parent          RECORD;
BEGIN
    LOOP
        -- Find direct parent node
        SELECT
            on_parent.user_id         AS parent_user_id,
            on_parent.acting_approver_id
        INTO v_parent
        FROM   organization_nodes AS on_child
        JOIN   organization_nodes AS on_parent ON on_parent.id = on_child.parent_id
        WHERE  on_child.user_id   = v_current_user_id
          AND  on_child.is_active = TRUE
          AND  on_parent.is_active = TRUE;

        -- No parent found → top of tree (CEO), return NULL for auto-approve
        IF NOT FOUND THEN
            RETURN NULL;
        END IF;

        -- Check if parent has approved leave overlapping the requested dates
        IF EXISTS (
            SELECT 1
            FROM   leave_requests
            WHERE  user_id    = v_parent.parent_user_id
              AND  status     = 'approved'
              AND  start_date <= p_end_date
              AND  end_date   >= p_start_date
        ) THEN
            -- Parent is on leave — try acting approver first
            IF v_parent.acting_approver_id IS NOT NULL THEN
                RETURN v_parent.acting_approver_id;
            END IF;
            -- Otherwise climb further up the tree
            v_current_user_id := v_parent.parent_user_id;
            CONTINUE;
        END IF;

        -- Parent is available
        RETURN v_parent.parent_user_id;
    END LOOP;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION find_approver IS
    'Walk org tree upward from p_user_id to find available approver. '
    'Skips nodes on approved leave, uses acting_approver_id if set. '
    'Returns NULL if no parent exists (CEO → auto-approve).';


-- ----------------------------------------------------------------
-- F4: Get available leave balance for a user
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_leave_balance(
    p_user_id    UUID,
    p_leave_type leave_type,
    p_year       INT
) RETURNS NUMERIC AS $$
DECLARE
    v_available NUMERIC;
BEGIN
    SELECT GREATEST(
        quota_days + carried_forward + adjusted_days - used_days - pending_days,
        0
    )
    INTO v_available
    FROM leave_balances
    WHERE user_id    = p_user_id
      AND leave_type = p_leave_type
      AND year       = p_year;

    RETURN COALESCE(v_available, 0);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_leave_balance IS
    'Returns available leave days for a user. Returns 0 if no balance record exists.';


-- ----------------------------------------------------------------
-- F5: Initialize leave balances for a new user
-- Called when a new employee is created
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION init_leave_balances(
    p_user_id    UUID,
    p_company_id UUID,
    p_hire_date  DATE,
    p_year       INT DEFAULT EXTRACT(YEAR FROM NOW())::INT
) RETURNS VOID AS $$
DECLARE
    v_policy    RECORD;
    v_quota     NUMERIC;
BEGIN
    FOR v_policy IN
        SELECT leave_type, quota_days
        FROM   leave_policies
        WHERE  company_id = p_company_id
          AND  year       = p_year
          AND  is_active  = TRUE
    LOOP
        -- Annual leave: compute from seniority
        IF v_policy.leave_type = 'annual' THEN
            v_quota := calc_annual_leave_quota(p_hire_date, p_year);
        ELSE
            v_quota := v_policy.quota_days;
        END IF;

        INSERT INTO leave_balances
            (company_id, user_id, leave_type, year, quota_days)
        VALUES
            (p_company_id, p_user_id, v_policy.leave_type, p_year, v_quota)
        ON CONFLICT (user_id, leave_type, year) DO NOTHING;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION init_leave_balances IS
    'Create leave_balance rows for a new employee for the given year. '
    'Call on user creation and on each new year rollover.';


-- ----------------------------------------------------------------
-- F6: Year-end carry-forward process
-- Run as a scheduled job on December 31 each year
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION process_yearend_carryforward(
    p_company_id UUID,
    p_year       INT
) RETURNS INT AS $$
DECLARE
    v_count      INT := 0;
    v_user       RECORD;
    v_balance    RECORD;
    v_available  NUMERIC;
    v_carry      NUMERIC;
    v_new_quota  NUMERIC;
BEGIN
    FOR v_user IN
        SELECT id, hire_date FROM users
        WHERE  company_id = p_company_id
          AND  status     = 'active'
    LOOP
        -- Only process annual leave for carry-forward
        SELECT * INTO v_balance
        FROM   leave_balances
        WHERE  user_id    = v_user.id
          AND  leave_type = 'annual'
          AND  year       = p_year;

        IF FOUND THEN
            v_available := GREATEST(
                v_balance.quota_days + v_balance.carried_forward
                + v_balance.adjusted_days - v_balance.used_days - v_balance.pending_days,
                0
            );
            -- Cap carry-forward at 7 days
            v_carry := LEAST(v_available, 7);
            -- New quota for next year based on updated seniority
            v_new_quota := calc_annual_leave_quota(v_user.hire_date, p_year + 1);

            -- Upsert balance for next year
            INSERT INTO leave_balances
                (company_id, user_id, leave_type, year, quota_days, carried_forward)
            VALUES
                (p_company_id, v_user.id, 'annual', p_year + 1, v_new_quota, v_carry)
            ON CONFLICT (user_id, leave_type, year)
            DO UPDATE SET
                quota_days      = EXCLUDED.quota_days,
                carried_forward = EXCLUDED.carried_forward,
                updated_at      = NOW();

            v_count := v_count + 1;
        END IF;
    END LOOP;

    RETURN v_count; -- returns number of employees processed
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION process_yearend_carryforward IS
    'Year-end process: carry forward annual leave balance (max 7 days), '
    'recalculate seniority quota for next year. Returns employee count processed.';


-- ----------------------------------------------------------------
-- F7: Lock timesheet dates when leave is approved
-- Called after leave_requests.status → 'approved'
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION lock_timesheet_for_leave(
    p_leave_request_id UUID
) RETURNS VOID AS $$
DECLARE
    v_leave   RECORD;
    v_ts      RECORD;
    v_cursor  DATE;
    v_hours   NUMERIC;
    v_ts_id   UUID;
BEGIN
    SELECT * INTO v_leave
    FROM   leave_requests
    WHERE  id = p_leave_request_id AND status = 'approved';

    IF NOT FOUND THEN RETURN; END IF;

    v_cursor := v_leave.start_date;

    WHILE v_cursor <= v_leave.end_date LOOP
        -- Skip weekends
        IF EXTRACT(DOW FROM v_cursor) NOT IN (0, 6) THEN
            -- Skip company holidays
            IF NOT EXISTS (
                SELECT 1 FROM holidays
                WHERE company_id   = v_leave.company_id
                  AND holiday_date = v_cursor
                  AND is_active    = TRUE
            ) THEN
                -- Determine hours to lock
                IF v_leave.is_half_day THEN
                    v_hours := 4;
                ELSE
                    v_hours := 8;
                END IF;

                -- Get or create timesheet for that month
                INSERT INTO timesheets (company_id, user_id, year, month)
                VALUES (
                    v_leave.company_id,
                    v_leave.user_id,
                    EXTRACT(YEAR  FROM v_cursor)::INT,
                    EXTRACT(MONTH FROM v_cursor)::INT
                )
                ON CONFLICT (user_id, year, month) DO NOTHING
                RETURNING id INTO v_ts_id;

                IF v_ts_id IS NULL THEN
                    SELECT id INTO v_ts_id FROM timesheets
                    WHERE user_id = v_leave.user_id
                      AND year    = EXTRACT(YEAR  FROM v_cursor)::INT
                      AND month   = EXTRACT(MONTH FROM v_cursor)::INT;
                END IF;

                -- Insert leave line (upsert to avoid duplicate if re-approved)
                INSERT INTO timesheet_lines
                    (timesheet_id, work_date, hours, line_type, leave_request_id)
                VALUES
                    (v_ts_id, v_cursor, v_hours, 'leave', p_leave_request_id)
                ON CONFLICT (timesheet_id, work_date, job_id)
                DO UPDATE SET hours = EXCLUDED.hours, leave_request_id = EXCLUDED.leave_request_id;
            END IF;
        END IF;
        v_cursor := v_cursor + INTERVAL '1 day';
    END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION lock_timesheet_for_leave IS
    'When leave is approved, auto-insert leave lines into the employee''s timesheet '
    'blocking those dates. Full day=8hrs, half-day=4hrs. Skips weekends and holidays.';


-- ════════════════════════════════════════════════════════
-- 017_rls_policies.sql
-- ════════════════════════════════════════════════════════
-- ============================================================
-- 017_rls_policies.sql
-- HiSafe-CON WorkSpace
-- Row-Level Security — data isolation between Safecon & Highcon
-- JWT claim: app.company_id set by Next.js middleware on each request
-- JWT claim: app.user_id   set by Next.js middleware on each request
-- JWT claim: app.role      set by Next.js middleware on each request
-- ============================================================

-- Enable RLS on all tenant-scoped tables
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_nodes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_policies      ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances      ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_approvals     ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_lines     ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays            ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_line_accounts  ENABLE ROW LEVEL SECURITY;

-- Helper: get current company_id from JWT claim
CREATE OR REPLACE FUNCTION current_company_id() RETURNS UUID AS $$
BEGIN
    RETURN current_setting('app.company_id', TRUE)::UUID;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Helper: get current user_id from JWT claim
CREATE OR REPLACE FUNCTION current_user_id() RETURNS UUID AS $$
BEGIN
    RETURN current_setting('app.user_id', TRUE)::UUID;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Helper: get current role from JWT claim
CREATE OR REPLACE FUNCTION current_user_role() RETURNS user_role AS $$
BEGIN
    RETURN current_setting('app.role', TRUE)::user_role;
EXCEPTION WHEN OTHERS THEN
    RETURN 'employee'::user_role;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Helper: is current user hr or admin?
CREATE OR REPLACE FUNCTION is_hr_or_admin() RETURNS BOOLEAN AS $$
BEGIN
    RETURN current_user_role() IN ('hr', 'admin');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ----------------------------------------------------------------
-- USERS
-- All roles see users in their company (org chart, search)
-- Only admin can write
-- ----------------------------------------------------------------
CREATE POLICY users_select ON users
    FOR SELECT USING (company_id = current_company_id());

CREATE POLICY users_insert ON users
    FOR INSERT WITH CHECK (
        company_id = current_company_id()
        AND current_user_role() = 'admin'
    );

CREATE POLICY users_update ON users
    FOR UPDATE USING (
        company_id = current_company_id()
        AND (
            current_user_role() = 'admin'
            OR id = current_user_id()   -- own profile
        )
    );

-- ----------------------------------------------------------------
-- LEAVE REQUESTS
-- Employee: own records only
-- Supervisor: own + subordinates (handled at API level, RLS = company)
-- HR/Admin: all in company
-- ----------------------------------------------------------------
CREATE POLICY leave_requests_select ON leave_requests
    FOR SELECT USING (
        company_id = current_company_id()
        AND (
            is_hr_or_admin()
            OR user_id = current_user_id()
            OR current_approver_id = current_user_id()
        )
    );

CREATE POLICY leave_requests_insert ON leave_requests
    FOR INSERT WITH CHECK (
        company_id = current_company_id()
        AND user_id = current_user_id()
    );

CREATE POLICY leave_requests_update ON leave_requests
    FOR UPDATE USING (
        company_id = current_company_id()
        AND (
            is_hr_or_admin()
            OR user_id             = current_user_id()
            OR current_approver_id = current_user_id()
        )
    );

-- ----------------------------------------------------------------
-- LEAVE BALANCES
-- Employee: own only
-- HR/Admin: all in company
-- ----------------------------------------------------------------
CREATE POLICY leave_balances_select ON leave_balances
    FOR SELECT USING (
        company_id = current_company_id()
        AND (is_hr_or_admin() OR user_id = current_user_id())
    );

CREATE POLICY leave_balances_write ON leave_balances
    FOR ALL USING (
        company_id = current_company_id()
        AND is_hr_or_admin()
    );

-- ----------------------------------------------------------------
-- TIMESHEETS
-- Same pattern as leave_requests
-- ----------------------------------------------------------------
CREATE POLICY timesheets_select ON timesheets
    FOR SELECT USING (
        company_id = current_company_id()
        AND (
            is_hr_or_admin()
            OR user_id = current_user_id()
            OR current_approver_id = current_user_id()
        )
    );

CREATE POLICY timesheets_insert ON timesheets
    FOR INSERT WITH CHECK (
        company_id = current_company_id()
        AND user_id = current_user_id()
    );

CREATE POLICY timesheets_update ON timesheets
    FOR UPDATE USING (
        company_id = current_company_id()
        AND (
            is_hr_or_admin()
            OR user_id             = current_user_id()
            OR current_approver_id = current_user_id()
        )
    );

-- ----------------------------------------------------------------
-- TIMESHEET LINES (inherit from timesheet)
-- ----------------------------------------------------------------
CREATE POLICY ts_lines_select ON timesheet_lines
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM timesheets t
            WHERE t.id = timesheet_id
              AND t.company_id = current_company_id()
              AND (
                  is_hr_or_admin()
                  OR t.user_id             = current_user_id()
                  OR t.current_approver_id = current_user_id()
              )
        )
    );

CREATE POLICY ts_lines_write ON timesheet_lines
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM timesheets t
            WHERE t.id = timesheet_id
              AND t.company_id = current_company_id()
              AND (is_hr_or_admin() OR t.user_id = current_user_id())
              AND t.status IN ('draft', 'rejected')   -- can only edit non-submitted
        )
    );

-- ----------------------------------------------------------------
-- JOBS (all users can read active jobs; only admin writes)
-- ----------------------------------------------------------------
CREATE POLICY jobs_select ON jobs
    FOR SELECT USING (company_id = current_company_id());

CREATE POLICY jobs_write ON jobs
    FOR ALL USING (
        company_id = current_company_id()
        AND current_user_role() = 'admin'
    );

-- ----------------------------------------------------------------
-- HOLIDAYS (all can read; hr/admin write)
-- ----------------------------------------------------------------
CREATE POLICY holidays_select ON holidays
    FOR SELECT USING (company_id = current_company_id());

CREATE POLICY holidays_write ON holidays
    FOR ALL USING (
        company_id = current_company_id()
        AND is_hr_or_admin()
    );

-- ----------------------------------------------------------------
-- NOTIFICATIONS (own only)
-- ----------------------------------------------------------------
CREATE POLICY notifications_select ON notifications
    FOR SELECT USING (
        company_id   = current_company_id()
        AND recipient_id = current_user_id()
    );

CREATE POLICY notifications_update ON notifications
    FOR UPDATE USING (
        company_id   = current_company_id()
        AND recipient_id = current_user_id()
    );

-- ----------------------------------------------------------------
-- AUDIT LOGS (HR/Admin read-only)
-- ----------------------------------------------------------------
CREATE POLICY audit_logs_select ON audit_logs
    FOR SELECT USING (
        company_id = current_company_id()
        AND is_hr_or_admin()
    );

-- System inserts (bypasses RLS via SECURITY DEFINER functions)
CREATE POLICY audit_logs_insert ON audit_logs
    FOR INSERT WITH CHECK (company_id = current_company_id());

-- ----------------------------------------------------------------
-- ORG NODES, LEAVE POLICIES, LEAVE/TS APPROVALS
-- ----------------------------------------------------------------
CREATE POLICY org_select ON organization_nodes
    FOR SELECT USING (company_id = current_company_id());

CREATE POLICY org_write ON organization_nodes
    FOR ALL USING (
        company_id = current_company_id()
        AND current_user_role() = 'admin'
    );

CREATE POLICY leave_policies_select ON leave_policies
    FOR SELECT USING (company_id = current_company_id());

CREATE POLICY leave_policies_write ON leave_policies
    FOR ALL USING (
        company_id = current_company_id()
        AND is_hr_or_admin()
    );

CREATE POLICY leave_approvals_select ON leave_approvals
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM leave_requests lr
            WHERE lr.id = leave_request_id
              AND lr.company_id = current_company_id()
              AND (
                  is_hr_or_admin()
                  OR lr.user_id = current_user_id()
              )
        )
    );

CREATE POLICY ts_approvals_select ON timesheet_approvals
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM timesheets t
            WHERE t.id = timesheet_id
              AND t.company_id = current_company_id()
              AND (is_hr_or_admin() OR t.user_id = current_user_id())
        )
    );

CREATE POLICY line_accounts_select ON user_line_accounts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = user_id
              AND u.company_id = current_company_id()
        )
    );

CREATE POLICY line_accounts_write ON user_line_accounts
    FOR ALL USING (user_id = current_user_id());


-- ════════════════════════════════════════════════════════
-- 018_seed_companies.sql
-- ════════════════════════════════════════════════════════
-- ============================================================
-- 018_seed_companies.sql
-- HiSafe-CON WorkSpace
-- Seed: sample holidays 2025–2026 (Thailand national holidays)
-- HR will maintain these via UI going forward
-- ============================================================

-- ----------------------------------------------------------------
-- Thailand national holidays 2026 (sample — HR updates each year)
-- Applied to both companies
-- ----------------------------------------------------------------
DO $$
DECLARE
    v_company RECORD;
BEGIN
    FOR v_company IN SELECT id FROM companies LOOP

        -- 2025
        INSERT INTO holidays (company_id, holiday_date, name_th, name_en, type) VALUES
            (v_company.id, '2025-01-01', 'วันขึ้นปีใหม่',              'New Year''s Day',            'national'),
            (v_company.id, '2025-02-12', 'วันมาฆบูชา',                 'Makha Bucha Day',            'national'),
            (v_company.id, '2025-04-06', 'วันจักรี',                   'Chakri Memorial Day',        'national'),
            (v_company.id, '2025-04-13', 'วันสงกรานต์',                'Songkran Festival',          'national'),
            (v_company.id, '2025-04-14', 'วันสงกรานต์',                'Songkran Festival',          'national'),
            (v_company.id, '2025-04-15', 'วันสงกรานต์',                'Songkran Festival',          'national'),
            (v_company.id, '2025-05-01', 'วันแรงงานแห่งชาติ',          'National Labour Day',        'national'),
            (v_company.id, '2025-05-05', 'วันฉัตรมงคล',                'Coronation Day',             'national'),
            (v_company.id, '2025-05-12', 'วันวิสาขบูชา',               'Visakha Bucha Day',          'national'),
            (v_company.id, '2025-06-03', 'วันเฉลิมพระชนมพรรษา ราชินี', 'HM Queen''s Birthday',       'national'),
            (v_company.id, '2025-07-28', 'วันเฉลิมพระชนมพรรษา รัชกาลที่ 10', 'HM King''s Birthday', 'national'),
            (v_company.id, '2025-08-12', 'วันแม่แห่งชาติ',             'Mother''s Day',              'national'),
            (v_company.id, '2025-10-13', 'วันคล้ายวันสวรรคต รัชกาลที่ 9', 'Memorial Day R9',        'national'),
            (v_company.id, '2025-10-23', 'วันปิยมหาราช',               'Chulalongkorn Day',          'national'),
            (v_company.id, '2025-12-05', 'วันพ่อแห่งชาติ',             'Father''s Day',              'national'),
            (v_company.id, '2025-12-10', 'วันรัฐธรรมนูญ',              'Constitution Day',           'national'),
            (v_company.id, '2025-12-31', 'วันสิ้นปี',                  'New Year''s Eve',            'national')
        ON CONFLICT (company_id, holiday_date) DO NOTHING;

        -- 2026
        INSERT INTO holidays (company_id, holiday_date, name_th, name_en, type) VALUES
            (v_company.id, '2026-01-01', 'วันขึ้นปีใหม่',              'New Year''s Day',            'national'),
            (v_company.id, '2026-03-04', 'วันมาฆบูชา',                 'Makha Bucha Day',            'national'),
            (v_company.id, '2026-04-06', 'วันจักรี',                   'Chakri Memorial Day',        'national'),
            (v_company.id, '2026-04-13', 'วันสงกรานต์',                'Songkran Festival',          'national'),
            (v_company.id, '2026-04-14', 'วันสงกรานต์',                'Songkran Festival',          'national'),
            (v_company.id, '2026-04-15', 'วันสงกรานต์',                'Songkran Festival',          'national'),
            (v_company.id, '2026-05-01', 'วันแรงงานแห่งชาติ',          'National Labour Day',        'national'),
            (v_company.id, '2026-05-04', 'วันฉัตรมงคล',                'Coronation Day',             'national'),
            (v_company.id, '2026-05-31', 'วันวิสาขบูชา',               'Visakha Bucha Day',          'national'),
            (v_company.id, '2026-06-03', 'วันเฉลิมพระชนมพรรษา ราชินี', 'HM Queen''s Birthday',       'national'),
            (v_company.id, '2026-07-28', 'วันเฉลิมพระชนมพรรษา รัชกาลที่ 10', 'HM King''s Birthday', 'national'),
            (v_company.id, '2026-08-12', 'วันแม่แห่งชาติ',             'Mother''s Day',              'national'),
            (v_company.id, '2026-10-13', 'วันคล้ายวันสวรรคต รัชกาลที่ 9', 'Memorial Day R9',        'national'),
            (v_company.id, '2026-10-23', 'วันปิยมหาราช',               'Chulalongkorn Day',          'national'),
            (v_company.id, '2026-12-05', 'วันพ่อแห่งชาติ',             'Father''s Day',              'national'),
            (v_company.id, '2026-12-10', 'วันรัฐธรรมนูญ',              'Constitution Day',           'national'),
            (v_company.id, '2026-12-31', 'วันสิ้นปี',                  'New Year''s Eve',            'national')
        ON CONFLICT (company_id, holiday_date) DO NOTHING;

    END LOOP;
END $$;


-- ----------------------------------------------------------------
-- Seed: sample admin user per company (update credentials via Supabase Auth)
-- Passwords managed by Supabase Auth — these rows are profile only
-- ----------------------------------------------------------------
DO $$
DECLARE
    v_safecon_id UUID;
    v_highcon_id  UUID;
BEGIN
    SELECT id INTO v_safecon_id FROM companies WHERE code = 'SAFECON';
    SELECT id INTO v_highcon_id  FROM companies WHERE code = 'HIGHCON';

    INSERT INTO users
        (company_id, employee_code, email, first_name_th, last_name_th,
         first_name_en, last_name_en, role, hire_date)
    VALUES
        (v_safecon_id, 'SC-ADMIN', 'admin@safecon.co.th',
         'แอดมิน', 'เซฟคอน', 'Admin', 'Safecon', 'admin', CURRENT_DATE),
        (v_highcon_id,  'HC-ADMIN', 'admin@highcon.co.th',
         'แอดมิน', 'ไฮคอน',  'Admin', 'Highcon', 'admin', CURRENT_DATE)
    ON CONFLICT DO NOTHING;
END $$;


-- ════════════════════════════════════════════════════════
-- 019_ot_requests.sql
-- ════════════════════════════════════════════════════════
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


-- ════════════════════════════════════════════════════════
-- 020_fix_rls_context_and_pending_days.sql
-- ════════════════════════════════════════════════════════
-- ============================================================
-- 020_fix_rls_context_and_pending_days.sql
-- HiSafe-CON WorkSpace — Critical Bug Fixes
--
-- Fix 1: set_app_context() missing → RLS not working
-- Fix 2: increment_pending_days() missing → pending_days not updated
-- Fix 3: timesheet submit uses hardcoded day-28 for CEO check
-- ============================================================

-- ── Fix 1: set_app_context ───────────────────────────────────
-- Sets PostgreSQL session variables for RLS policies
-- Called by api-helpers.ts withRLSContext() before every query

CREATE OR REPLACE FUNCTION set_app_context(
    p_company_id UUID,
    p_user_id    UUID,
    p_role       TEXT
) RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.company_id', p_company_id::TEXT, TRUE);
    PERFORM set_config('app.user_id',    p_user_id::TEXT,    TRUE);
    PERFORM set_config('app.role',       p_role,             TRUE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION set_app_context IS
    'Sets PostgreSQL session variables used by RLS policies. '
    'Must be called at the start of every API request. '
    'SECURITY DEFINER so it can set session config.';

-- ── Fix 2: increment_pending_days ────────────────────────────
-- Atomically increments pending_days in leave_balances
-- Called when a new leave request is submitted (status → pending)

CREATE OR REPLACE FUNCTION increment_pending_days(
    p_user_id    UUID,
    p_leave_type leave_type,
    p_year       INT,
    p_days       NUMERIC
) RETURNS VOID AS $$
BEGIN
    UPDATE leave_balances
    SET
        pending_days = GREATEST(pending_days + p_days, 0),
        updated_at   = NOW()
    WHERE
        user_id    = p_user_id
        AND leave_type = p_leave_type
        AND year       = p_year;

    -- If no row exists yet, create it
    IF NOT FOUND THEN
        INSERT INTO leave_balances (
            company_id, user_id, leave_type, year,
            quota_days, carried_forward, adjusted_days,
            used_days, pending_days
        )
        SELECT
            u.company_id, p_user_id, p_leave_type, p_year,
            0, 0, 0, 0, GREATEST(p_days, 0)
        FROM users u WHERE u.id = p_user_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_pending_days IS
    'Atomically adds p_days to leave_balances.pending_days. '
    'Creates balance row if missing. Use negative p_days to decrement.';

-- ── Fix 3: decrement_pending_days (for reject/cancel) ────────
CREATE OR REPLACE FUNCTION decrement_pending_days(
    p_user_id    UUID,
    p_leave_type leave_type,
    p_year       INT,
    p_days       NUMERIC
) RETURNS VOID AS $$
BEGIN
    UPDATE leave_balances
    SET
        pending_days = GREATEST(pending_days - p_days, 0),
        updated_at   = NOW()
    WHERE
        user_id    = p_user_id
        AND leave_type = p_leave_type
        AND year       = p_year;
END;
$$ LANGUAGE plpgsql;

-- ── Fix 4: last_day_of_month helper ──────────────────────────
-- Used in timesheet submit to find correct end-of-month date
-- instead of hardcoded day-28

CREATE OR REPLACE FUNCTION last_day_of_month(p_year INT, p_month INT)
RETURNS DATE AS $$
BEGIN
    RETURN (DATE_TRUNC('month', MAKE_DATE(p_year, p_month, 1)) + INTERVAL '1 month - 1 day')::DATE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION last_day_of_month IS
    'Returns the last calendar day of a given year/month. '
    'e.g. last_day_of_month(2026, 2) → 2026-02-28';

-- Verify all functions created
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
      'set_app_context', 'increment_pending_days',
      'decrement_pending_days', 'last_day_of_month',
      'find_approver', 'calc_leave_days', 'init_leave_balances'
  )
ORDER BY routine_name;


-- ════════════════════════════════════════════════════════
-- 021_hr_extended.sql
-- ════════════════════════════════════════════════════════
-- ============================================================
-- 021_hr_extended.sql
-- HiSafe-CON WorkSpace — HR Extended Module
-- สัญญาจ้าง | เงินเดือน | สมัครงาน | ลาออก | ใบรับรอง
-- ============================================================

-- ── Contract Types ───────────────────────────────────────────
CREATE TYPE contract_type   AS ENUM ('permanent','fixed_term','part_time','intern','outsource');
CREATE TYPE contract_status AS ENUM ('draft','active','expired','terminated');
CREATE TYPE salary_type     AS ENUM ('monthly','daily','hourly');
CREATE TYPE recruit_status  AS ENUM ('open','screening','interviewing','offering','hired','cancelled');
CREATE TYPE resign_status   AS ENUM ('pending','acknowledged','approved','completed');
CREATE TYPE cert_type       AS ENUM ('employment','salary','work_experience','other');

-- ── 1. Employment Contracts ──────────────────────────────────
CREATE TABLE contracts (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID            NOT NULL REFERENCES companies(id),
    user_id         UUID            NOT NULL REFERENCES users(id),
    contract_no     VARCHAR(50)     NOT NULL,
    contract_type   contract_type   NOT NULL DEFAULT 'permanent',
    status          contract_status NOT NULL DEFAULT 'draft',
    start_date      DATE            NOT NULL,
    end_date        DATE,                          -- NULL = permanent
    position_th     VARCHAR(200),
    position_en     VARCHAR(200),
    department      VARCHAR(200),
    work_location   VARCHAR(300),
    probation_days  INT             NOT NULL DEFAULT 120,
    probation_end   DATE,
    base_salary     NUMERIC(12,2)   NOT NULL DEFAULT 0,
    salary_type     salary_type     NOT NULL DEFAULT 'monthly',
    -- Benefits
    overtime_rate   NUMERIC(5,2)    DEFAULT 1.5,   -- multiplier
    allowances      JSONB           DEFAULT '{}',  -- {transport:500, meal:200}
    benefits        JSONB           DEFAULT '[]',  -- ["ประกันสังคม","ประกันชีวิต"]
    -- Terms
    notice_days     INT             DEFAULT 30,
    notes           TEXT,
    -- Signing
    signed_by_employee  BOOLEAN     DEFAULT FALSE,
    signed_by_hr        BOOLEAN     DEFAULT FALSE,
    signed_at           TIMESTAMPTZ,
    file_url            TEXT,                      -- PDF storage URL
    created_by      UUID            REFERENCES users(id),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_contract_no UNIQUE (company_id, contract_no),
    CONSTRAINT chk_contract_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

-- ── 2. Salary History ────────────────────────────────────────
CREATE TABLE salary_records (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID            NOT NULL REFERENCES companies(id),
    user_id         UUID            NOT NULL REFERENCES users(id),
    effective_date  DATE            NOT NULL,
    salary_type     salary_type     NOT NULL DEFAULT 'monthly',
    base_salary     NUMERIC(12,2)   NOT NULL,
    allowances      JSONB           DEFAULT '{}',
    deductions      JSONB           DEFAULT '{}',
    net_salary      NUMERIC(12,2),                 -- computed or manual
    reason          VARCHAR(500),                  -- ปรับเงินเดือนประจำปี, เลื่อนขั้น
    approved_by_id  UUID            REFERENCES users(id),
    approved_at     TIMESTAMPTZ,
    notes           TEXT,
    created_by      UUID            REFERENCES users(id),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ── 3. Recruitment / Job Openings ────────────────────────────
CREATE TABLE job_openings (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID            NOT NULL REFERENCES companies(id),
    title_th        VARCHAR(300)    NOT NULL,
    title_en        VARCHAR(300),
    department      VARCHAR(200),
    position_level  VARCHAR(100),
    headcount       INT             NOT NULL DEFAULT 1,
    status          recruit_status  NOT NULL DEFAULT 'open',
    salary_min      NUMERIC(12,2),
    salary_max      NUMERIC(12,2),
    requirements    TEXT,
    responsibilities TEXT,
    benefits        TEXT,
    work_location   VARCHAR(300),
    contract_type   contract_type   DEFAULT 'permanent',
    open_date       DATE            NOT NULL DEFAULT CURRENT_DATE,
    close_date      DATE,
    created_by      UUID            REFERENCES users(id),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TABLE applicants (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID            NOT NULL REFERENCES companies(id),
    job_opening_id  UUID            REFERENCES job_openings(id),
    first_name      VARCHAR(100)    NOT NULL,
    last_name       VARCHAR(100)    NOT NULL,
    email           VARCHAR(254),
    phone           VARCHAR(30),
    resume_url      TEXT,
    status          recruit_status  NOT NULL DEFAULT 'screening',
    applied_date    DATE            NOT NULL DEFAULT CURRENT_DATE,
    interview_date  TIMESTAMPTZ,
    interview_notes TEXT,
    offer_salary    NUMERIC(12,2),
    hired_date      DATE,
    -- Convert to employee
    user_id         UUID            REFERENCES users(id),  -- set when hired
    notes           TEXT,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ── 4. Resignation ───────────────────────────────────────────
CREATE TABLE resignations (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID            NOT NULL REFERENCES companies(id),
    user_id         UUID            NOT NULL REFERENCES users(id),
    status          resign_status   NOT NULL DEFAULT 'pending',
    resign_date     DATE            NOT NULL,        -- วันที่แจ้งลาออก
    last_work_date  DATE            NOT NULL,        -- วันทำงานวันสุดท้าย
    reason          TEXT,
    reason_category VARCHAR(100),                   -- personal, better_opportunity, etc.
    -- HR Process
    acknowledged_by UUID            REFERENCES users(id),
    acknowledged_at TIMESTAMPTZ,
    approved_by     UUID            REFERENCES users(id),
    approved_at     TIMESTAMPTZ,
    -- Clearance
    clearance_items JSONB           DEFAULT '[]',   -- checklist items
    clearance_done  BOOLEAN         DEFAULT FALSE,
    exit_interview  TEXT,
    -- Docs
    resignation_letter_url TEXT,
    certificate_issued BOOLEAN      DEFAULT FALSE,
    notes           TEXT,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_resign UNIQUE (user_id, resign_date),
    CONSTRAINT chk_resign_dates CHECK (last_work_date >= resign_date)
);

-- ── 5. Employment Certificates ───────────────────────────────
CREATE TABLE employment_certificates (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID            NOT NULL REFERENCES companies(id),
    user_id         UUID            NOT NULL REFERENCES users(id),
    cert_no         VARCHAR(50)     NOT NULL,
    cert_type       cert_type       NOT NULL DEFAULT 'employment',
    purpose         VARCHAR(300),                   -- เพื่อประกอบการสมัครสินเชื่อ
    issued_date     DATE            NOT NULL DEFAULT CURRENT_DATE,
    issued_by_id    UUID            REFERENCES users(id),
    -- Content snapshot (ณ วันที่ออก)
    position_th     VARCHAR(200),
    department      VARCHAR(200),
    hire_date       DATE,
    salary_amount   NUMERIC(12,2),
    include_salary  BOOLEAN         DEFAULT FALSE,
    -- Output
    file_url        TEXT,
    is_voided       BOOLEAN         DEFAULT FALSE,
    void_reason     TEXT,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_cert_no UNIQUE (company_id, cert_no)
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX idx_contracts_user    ON contracts        (user_id);
CREATE INDEX idx_contracts_company ON contracts        (company_id, status);
CREATE INDEX idx_salary_user       ON salary_records   (user_id, effective_date DESC);
CREATE INDEX idx_salary_company    ON salary_records   (company_id);
CREATE INDEX idx_openings_company  ON job_openings     (company_id, status);
CREATE INDEX idx_applicants_job    ON applicants       (job_opening_id);
CREATE INDEX idx_applicants_co     ON applicants       (company_id);
CREATE INDEX idx_resign_user       ON resignations     (user_id);
CREATE INDEX idx_resign_company    ON resignations     (company_id, status);
CREATE INDEX idx_certs_user        ON employment_certificates (user_id);
CREATE INDEX idx_certs_company     ON employment_certificates (company_id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE contracts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_records          ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_openings            ENABLE ROW LEVEL SECURITY;
ALTER TABLE applicants              ENABLE ROW LEVEL SECURITY;
ALTER TABLE resignations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE employment_certificates ENABLE ROW LEVEL SECURITY;

-- Contracts: HR/Admin see all; employee sees own
CREATE POLICY contracts_select ON contracts FOR SELECT USING (
    company_id = current_company_id()
    AND (is_hr_or_admin() OR user_id = current_user_id())
);
CREATE POLICY contracts_insert ON contracts FOR INSERT WITH CHECK (
    company_id = current_company_id() AND is_hr_or_admin()
);
CREATE POLICY contracts_update ON contracts FOR UPDATE USING (
    company_id = current_company_id() AND is_hr_or_admin()
);

-- Salary: HR/Admin only (employee cannot see others' salaries)
CREATE POLICY salary_select ON salary_records FOR SELECT USING (
    company_id = current_company_id()
    AND (is_hr_or_admin() OR user_id = current_user_id())
);
CREATE POLICY salary_insert ON salary_records FOR INSERT WITH CHECK (
    company_id = current_company_id() AND is_hr_or_admin()
);
CREATE POLICY salary_update ON salary_records FOR UPDATE USING (
    company_id = current_company_id() AND is_hr_or_admin()
);

-- Job openings: HR/Admin manage; employees read only
CREATE POLICY openings_select ON job_openings FOR SELECT USING (
    company_id = current_company_id()
);
CREATE POLICY openings_write ON job_openings FOR ALL USING (
    company_id = current_company_id() AND is_hr_or_admin()
);

-- Applicants: HR/Admin only
CREATE POLICY applicants_all ON applicants FOR ALL USING (
    company_id = current_company_id() AND is_hr_or_admin()
);

-- Resignations: HR/Admin + own user
CREATE POLICY resign_select ON resignations FOR SELECT USING (
    company_id = current_company_id()
    AND (is_hr_or_admin() OR user_id = current_user_id())
);
CREATE POLICY resign_insert ON resignations FOR INSERT WITH CHECK (
    company_id = current_company_id()
    AND (is_hr_or_admin() OR user_id = current_user_id())
);
CREATE POLICY resign_update ON resignations FOR UPDATE USING (
    company_id = current_company_id()
    AND (is_hr_or_admin() OR user_id = current_user_id())
);

-- Certificates: HR/Admin + own user
CREATE POLICY certs_select ON employment_certificates FOR SELECT USING (
    company_id = current_company_id()
    AND (is_hr_or_admin() OR user_id = current_user_id())
);
CREATE POLICY certs_write ON employment_certificates FOR ALL USING (
    company_id = current_company_id() AND is_hr_or_admin()
);

COMMENT ON TABLE contracts               IS 'Employment contracts with terms and salary';
COMMENT ON TABLE salary_records          IS 'Salary history and adjustments per employee';
COMMENT ON TABLE job_openings            IS 'Job vacancies posted by HR';
COMMENT ON TABLE applicants              IS 'Job applicants linked to openings';
COMMENT ON TABLE resignations            IS 'Resignation requests and clearance process';
COMMENT ON TABLE employment_certificates IS 'Official employment/salary certificates issued to employees';

