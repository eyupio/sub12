import { api } from './client'

export interface SMTPSettings {
  id: number
  host: string
  port: number
  username?: string
  from_email: string
  from_name?: string
  use_tls: boolean
  use_starttls: boolean
  has_password: boolean
  updated_by?: string
  updated_at: string
}

export interface UpdateSMTPSettingsInput {
  host: string
  port: number
  username?: string
  password_encrypted?: string
  from_email: string
  from_name?: string
  use_tls: boolean
  use_starttls: boolean
}

export interface SMTPTestResponse {
  ok: boolean
  message: string
  host: string
  port: number
}

export interface EmailTemplate {
  key: string
  subject_template: string
  html_template: string
  text_template: string
  is_enabled: boolean
  updated_by?: string
  updated_at: string
}

export interface EmailTemplateListResponse {
  items: EmailTemplate[]
}

export interface UpdateEmailTemplateInput {
  subject_template?: string
  html_template?: string
  text_template?: string
  is_enabled?: boolean
}

export interface TemplatePreviewInput {
  payload: Record<string, unknown>
}

export interface TemplatePreviewResponse {
  subject: string
  html: string
  text: string
}

export const adminEmailApi = {
  getSettings: () => api.get<SMTPSettings>('/admin/email/settings'),
  patchSettings: (payload: UpdateSMTPSettingsInput) =>
    api.patch<SMTPSettings>('/admin/email/settings', payload),
  testSettings: () => api.post<SMTPTestResponse>('/admin/email/settings/test', {}),

  listTemplates: () => api.get<EmailTemplateListResponse>('/admin/email/templates'),
  getTemplate: (key: string) => api.get<EmailTemplate>(`/admin/email/templates/${key}`),
  patchTemplate: (key: string, payload: UpdateEmailTemplateInput) =>
    api.patch<EmailTemplate>(`/admin/email/templates/${key}`, payload),
  previewTemplate: (key: string, payload: TemplatePreviewInput) =>
    api.post<TemplatePreviewResponse>(`/admin/email/templates/${key}/preview`, payload),
}
