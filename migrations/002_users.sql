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
