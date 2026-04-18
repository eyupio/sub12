-- Report scope + report-filed notification preference + email template seed.
-- Scopes user-submitted reports to a league or club so the relevant admins
-- can be notified and triage them, rather than everything funneling to
-- platform admins.

ALTER TABLE reports
    ADD COLUMN IF NOT EXISTS league_id UUID REFERENCES leagues(id) ON DELETE SET NULL;

ALTER TABLE reports
    ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reports_league_status
    ON reports (league_id, status, created_at DESC)
    WHERE league_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reports_club_status
    ON reports (club_id, status, created_at DESC)
    WHERE club_id IS NOT NULL;

ALTER TABLE notification_preferences
    ADD COLUMN IF NOT EXISTS report_filed BOOLEAN NOT NULL DEFAULT TRUE;

-- Seed an admin-editable email template for the new notification type.
-- Disabled by default; platform operators opt in by enabling the template.
INSERT INTO email_templates (key, subject_template, html_template, text_template, is_enabled)
VALUES (
    'notification_report_filed',
    '[sub12.io] New report in {{.community_name}}',
    '<p>Hi {{.display_name}},</p><p>A member of {{.community_name}} has flagged {{.target_label}} for review.</p><p>Reason: <strong>{{.reason}}</strong></p><p><a href="{{.report_link}}">Open the report</a></p><p>— sub12.io Moderation</p>',
    'Hi {{.display_name}},

A member of {{.community_name}} has flagged {{.target_label}} for review.

Reason: {{.reason}}

Open the report: {{.report_link}}

— sub12.io Moderation
',
    FALSE
)
ON CONFLICT (key) DO NOTHING;
