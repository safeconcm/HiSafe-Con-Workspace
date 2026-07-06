-- ============================================================
-- 003_user_line_accounts.sql
-- HiSafe-CON WorkSpace
-- LINE User ID mapping for personal push notifications
-- ============================================================

CREATE TABLE user_line_accounts (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID         NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    line_user_id    VARCHAR(100) NOT NULL UNIQUE,
    display_name    VARCHAR(200),
    picture_url     TEXT,
    linked_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_line_accounts_user ON user_line_accounts (user_id);

COMMENT ON TABLE  user_line_accounts              IS 'LINE User ID linked to each employee for personal push';
COMMENT ON COLUMN user_line_accounts.line_user_id IS 'LINE userId from LIFF login or webhook event';
