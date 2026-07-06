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
