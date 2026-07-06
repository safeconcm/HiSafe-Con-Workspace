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
