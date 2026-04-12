DROP TABLE IF EXISTS email_change_tokens;
DELETE FROM email_templates WHERE key = 'email_change_confirm';
