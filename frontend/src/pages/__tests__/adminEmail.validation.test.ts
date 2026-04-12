import { describe, expect, it } from 'vitest'
import { validateSMTPSettingsForm, validateTemplateForm } from '../adminEmailValidation'

describe('admin email page validation', () => {
  it('validates smtp settings fields and security combination', () => {
    const errors = validateSMTPSettingsForm({
      host: '',
      port: '70000',
      username: 'smtp-user',
      password: '',
      from_email: 'invalid-email',
      from_name: 'Support',
      use_tls: true,
      use_starttls: true,
      updatePassword: true,
    })

    expect(errors).toContain('Host is required.')
    expect(errors).toContain('Port must be between 1 and 65535.')
    expect(errors).toContain('From email must be a valid email address.')
    expect(errors).toContain('TLS and STARTTLS cannot both be enabled.')
    expect(errors).toContain('Password is required when update password is enabled.')
  })

  it('requires template fields when template is enabled', () => {
    const errors = validateTemplateForm({
      subject_template: '',
      html_template: '',
      text_template: '',
      is_enabled: true,
    })

    expect(errors).toEqual([
      'Subject is required when enabled.',
      'HTML body is required when enabled.',
      'Text body is required when enabled.',
    ])
  })
})
