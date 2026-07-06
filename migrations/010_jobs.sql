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
