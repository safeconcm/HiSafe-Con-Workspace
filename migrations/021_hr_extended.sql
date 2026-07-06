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
