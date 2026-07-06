-- ============================================================
-- 014_notifications.sql
-- HiSafe-CON WorkSpace
-- Notification queue for in-app, email, and LINE OA
-- Each channel gets its own row — allows per-channel retry
-- ============================================================

CREATE TYPE notification_channel AS ENUM ('in_app', 'email', 'line');
CREATE TYPE notification_status  AS ENUM ('pending', 'sent', 'failed', 'read');
CREATE TYPE notification_event   AS ENUM (
    'leave_submitted',
    'leave_approved',
    'leave_rejected',
    'leave_cancelled',
    'leave_cancel_requested',
    'leave_balance_adjusted',
    'timesheet_submitted',
    'timesheet_approved',
    'timesheet_rejected',
    'general'
);

CREATE TABLE notifications (
    id              UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID                  NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    recipient_id    UUID                  NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
    channel         notification_channel  NOT NULL,
    event_type      notification_event    NOT NULL,
    title           VARCHAR(300)          NOT NULL,
    body            TEXT                  NOT NULL,
    -- Deep link: which entity triggered this notification
    reference_id    UUID,
    reference_type  VARCHAR(50)           CHECK (reference_type IN ('leave_request', 'timesheet', 'leave_balance')),
    status          notification_status   NOT NULL DEFAULT 'pending',
    retry_count     INT                   NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    max_retries     INT                   NOT NULL DEFAULT 3,
    last_error      TEXT,
    -- Timestamps
    read_at         TIMESTAMPTZ,
    sent_at         TIMESTAMPTZ,
    next_retry_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_recipient        ON notifications (recipient_id, status);
CREATE INDEX idx_notif_company          ON notifications (company_id);
CREATE INDEX idx_notif_pending          ON notifications (status, next_retry_at) WHERE status IN ('pending', 'failed');
CREATE INDEX idx_notif_in_app_unread    ON notifications (recipient_id, created_at DESC)
    WHERE channel = 'in_app' AND status <> 'read';

COMMENT ON TABLE  notifications               IS 'Per-channel notification queue with retry support';
COMMENT ON COLUMN notifications.channel       IS 'in_app | email | line — one row per channel per event';
COMMENT ON COLUMN notifications.reference_id  IS 'UUID of the related leave_request or timesheet';
COMMENT ON COLUMN notifications.next_retry_at IS 'Set by worker after failed send; NULL = ready to process now';
COMMENT ON COLUMN notifications.max_retries   IS 'Give up after this many failures';
