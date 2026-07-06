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
