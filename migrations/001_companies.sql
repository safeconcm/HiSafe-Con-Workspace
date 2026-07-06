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
