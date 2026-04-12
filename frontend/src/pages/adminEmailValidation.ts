export interface SMTPSettingsFormState {
  host: string
  port: string
  username: string
  password: string
  from_email: string
  from_name: string
  use_tls: boolean
  use_starttls: boolean
  updatePassword: boolean
}

export function validateSMTPSettingsForm(values: SMTPSettingsFormState): string[] {
  const errors: string[] = []
  if (!values.host.trim()) errors.push('Host is required.')

  const port = Number(values.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push('Port must be between 1 and 65535.')
  }

  if (!values.from_email.trim()) {
    errors.push('From email is required.')
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.from_email)) {
    errors.push('From email must be a valid email address.')
  }

  if (values.use_tls && values.use_starttls) {
    errors.push('TLS and STARTTLS cannot both be enabled.')
  }

  if (values.updatePassword && !values.password.trim()) {
    errors.push('Password is required when update password is enabled.')
  }

  return errors
}

export interface TemplateFormState {
  subject_template: string
  html_template: string
  text_template: string
  is_enabled: boolean
}

export function validateTemplateForm(values: TemplateFormState): string[] {
  const errors: string[] = []
  if (values.is_enabled) {
    if (!values.subject_template.trim()) errors.push('Subject is required when enabled.')
    if (!values.html_template.trim()) errors.push('HTML body is required when enabled.')
    if (!values.text_template.trim()) errors.push('Text body is required when enabled.')
  }
  return errors
}
