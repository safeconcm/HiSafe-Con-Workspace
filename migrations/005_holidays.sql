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
