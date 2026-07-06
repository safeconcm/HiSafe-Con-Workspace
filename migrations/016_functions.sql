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
