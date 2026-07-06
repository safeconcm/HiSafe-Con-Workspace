-- ============================================================
-- 018_seed_companies.sql
-- HiSafe-CON WorkSpace
-- Seed: sample holidays 2025–2026 (Thailand national holidays)
-- HR will maintain these via UI going forward
-- ============================================================

-- ----------------------------------------------------------------
-- Thailand national holidays 2026 (sample — HR updates each year)
-- Applied to both companies
-- ----------------------------------------------------------------
DO $$
DECLARE
    v_company RECORD;
BEGIN
    FOR v_company IN SELECT id FROM companies LOOP

        -- 2025
        INSERT INTO holidays (company_id, holiday_date, name_th, name_en, type) VALUES
            (v_company.id, '2025-01-01', 'วันขึ้นปีใหม่',              'New Year''s Day',            'national'),
            (v_company.id, '2025-02-12', 'วันมาฆบูชา',                 'Makha Bucha Day',            'national'),
            (v_company.id, '2025-04-06', 'วันจักรี',                   'Chakri Memorial Day',        'national'),
            (v_company.id, '2025-04-13', 'วันสงกรานต์',                'Songkran Festival',          'national'),
            (v_company.id, '2025-04-14', 'วันสงกรานต์',                'Songkran Festival',          'national'),
            (v_company.id, '2025-04-15', 'วันสงกรานต์',                'Songkran Festival',          'national'),
            (v_company.id, '2025-05-01', 'วันแรงงานแห่งชาติ',          'National Labour Day',        'national'),
            (v_company.id, '2025-05-05', 'วันฉัตรมงคล',                'Coronation Day',             'national'),
            (v_company.id, '2025-05-12', 'วันวิสาขบูชา',               'Visakha Bucha Day',          'national'),
            (v_company.id, '2025-06-03', 'วันเฉลิมพระชนมพรรษา ราชินี', 'HM Queen''s Birthday',       'national'),
            (v_company.id, '2025-07-28', 'วันเฉลิมพระชนมพรรษา รัชกาลที่ 10', 'HM King''s Birthday', 'national'),
            (v_company.id, '2025-08-12', 'วันแม่แห่งชาติ',             'Mother''s Day',              'national'),
            (v_company.id, '2025-10-13', 'วันคล้ายวันสวรรคต รัชกาลที่ 9', 'Memorial Day R9',        'national'),
            (v_company.id, '2025-10-23', 'วันปิยมหาราช',               'Chulalongkorn Day',          'national'),
            (v_company.id, '2025-12-05', 'วันพ่อแห่งชาติ',             'Father''s Day',              'national'),
            (v_company.id, '2025-12-10', 'วันรัฐธรรมนูญ',              'Constitution Day',           'national'),
            (v_company.id, '2025-12-31', 'วันสิ้นปี',                  'New Year''s Eve',            'national')
        ON CONFLICT (company_id, holiday_date) DO NOTHING;

        -- 2026
        INSERT INTO holidays (company_id, holiday_date, name_th, name_en, type) VALUES
            (v_company.id, '2026-01-01', 'วันขึ้นปีใหม่',              'New Year''s Day',            'national'),
            (v_company.id, '2026-03-04', 'วันมาฆบูชา',                 'Makha Bucha Day',            'national'),
            (v_company.id, '2026-04-06', 'วันจักรี',                   'Chakri Memorial Day',        'national'),
            (v_company.id, '2026-04-13', 'วันสงกรานต์',                'Songkran Festival',          'national'),
            (v_company.id, '2026-04-14', 'วันสงกรานต์',                'Songkran Festival',          'national'),
            (v_company.id, '2026-04-15', 'วันสงกรานต์',                'Songkran Festival',          'national'),
            (v_company.id, '2026-05-01', 'วันแรงงานแห่งชาติ',          'National Labour Day',        'national'),
            (v_company.id, '2026-05-04', 'วันฉัตรมงคล',                'Coronation Day',             'national'),
            (v_company.id, '2026-05-31', 'วันวิสาขบูชา',               'Visakha Bucha Day',          'national'),
            (v_company.id, '2026-06-03', 'วันเฉลิมพระชนมพรรษา ราชินี', 'HM Queen''s Birthday',       'national'),
            (v_company.id, '2026-07-28', 'วันเฉลิมพระชนมพรรษา รัชกาลที่ 10', 'HM King''s Birthday', 'national'),
            (v_company.id, '2026-08-12', 'วันแม่แห่งชาติ',             'Mother''s Day',              'national'),
            (v_company.id, '2026-10-13', 'วันคล้ายวันสวรรคต รัชกาลที่ 9', 'Memorial Day R9',        'national'),
            (v_company.id, '2026-10-23', 'วันปิยมหาราช',               'Chulalongkorn Day',          'national'),
            (v_company.id, '2026-12-05', 'วันพ่อแห่งชาติ',             'Father''s Day',              'national'),
            (v_company.id, '2026-12-10', 'วันรัฐธรรมนูญ',              'Constitution Day',           'national'),
            (v_company.id, '2026-12-31', 'วันสิ้นปี',                  'New Year''s Eve',            'national')
        ON CONFLICT (company_id, holiday_date) DO NOTHING;

    END LOOP;
END $$;


-- ----------------------------------------------------------------
-- Seed: sample admin user per company (update credentials via Supabase Auth)
-- Passwords managed by Supabase Auth — these rows are profile only
-- ----------------------------------------------------------------
DO $$
DECLARE
    v_safecon_id UUID;
    v_highcon_id  UUID;
BEGIN
    SELECT id INTO v_safecon_id FROM companies WHERE code = 'SAFECON';
    SELECT id INTO v_highcon_id  FROM companies WHERE code = 'HIGHCON';

    INSERT INTO users
        (company_id, employee_code, email, first_name_th, last_name_th,
         first_name_en, last_name_en, role, hire_date)
    VALUES
        (v_safecon_id, 'SC-ADMIN', 'admin@safecon.co.th',
         'แอดมิน', 'เซฟคอน', 'Admin', 'Safecon', 'admin', CURRENT_DATE),
        (v_highcon_id,  'HC-ADMIN', 'admin@highcon.co.th',
         'แอดมิน', 'ไฮคอน',  'Admin', 'Highcon', 'admin', CURRENT_DATE)
    ON CONFLICT DO NOTHING;
END $$;
