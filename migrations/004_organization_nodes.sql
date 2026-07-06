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
