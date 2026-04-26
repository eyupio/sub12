import { api } from './client'
import { useAuthStore } from '../store/auth'

export interface BackupSettings {
  id: number
  enabled: boolean
  frequency: 'disabled' | 'hourly' | 'daily' | 'weekly'
  hour_of_day: number
  day_of_week: number
  destination: 'local' | 's3' | 'both'
  local_path: string
  s3_endpoint?: string
  s3_region?: string
  s3_bucket?: string
  s3_prefix?: string
  s3_use_ssl: boolean
  s3_path_style: boolean
  has_s3_access_key: boolean
  has_s3_secret_key: boolean
  has_passphrase: boolean
  retain_count: number
  retain_days: number
  last_run_at?: string
  last_run_status?: string
  last_run_error?: string
  updated_by?: string
  updated_at: string
}

export interface UpdateBackupSettingsInput {
  enabled: boolean
  frequency: BackupSettings['frequency']
  hour_of_day: number
  day_of_week: number
  destination: BackupSettings['destination']
  local_path: string
  s3_endpoint?: string | null
  s3_region?: string | null
  s3_bucket?: string | null
  s3_prefix?: string | null
  s3_access_key?: string | null
  s3_secret_key?: string | null
  s3_use_ssl: boolean
  s3_path_style: boolean
  passphrase?: string | null
  retain_count: number
  retain_days: number
}

export interface BackupRun {
  id: string
  started_at: string
  finished_at?: string
  status: 'running' | 'success' | 'failed'
  trigger: 'scheduled' | 'manual'
  destination: 'local' | 's3' | 'both'
  filename: string
  local_path?: string
  s3_key?: string
  size_bytes: number
  error?: string
  created_by?: string
}

export interface BackupRunsResponse {
  items: BackupRun[]
  total: number
  limit: number
  offset: number
}

export interface S3TestResponse {
  ok: boolean
  message: string
}

const BASE = import.meta.env.VITE_API_URL ?? '/api/v1'

export const adminBackupApi = {
  getSettings: () => api.get<BackupSettings>('/admin/backup/settings'),
  patchSettings: (payload: UpdateBackupSettingsInput) =>
    api.patch<BackupSettings>('/admin/backup/settings', payload),
  testS3: (payload: UpdateBackupSettingsInput) =>
    api.post<S3TestResponse>('/admin/backup/settings/test-s3', payload),
  run: () => api.post<BackupRun>('/admin/backup/run', {}),
  listRuns: (limit = 50, offset = 0) =>
    api.get<BackupRunsResponse>(`/admin/backup/runs?limit=${limit}&offset=${offset}`),
  deleteRun: (id: string) => api.del<void>(`/admin/backup/runs/${id}`),
  restoreFromRun: (id: string) =>
    api.post<{ ok: boolean }>(`/admin/backup/restore/${id}?confirm=true`, {}),
  restoreUpload: async (file: File): Promise<{ ok: boolean }> => {
    const fd = new FormData()
    fd.append('file', file)
    const token = useAuthStore.getState().accessToken
    const res = await fetch(`${BASE}/admin/backup/restore/upload?confirm=true`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: fd,
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || `restore failed: ${res.status}`)
    }
    return res.json()
  },
  downloadUrl: (id: string) => `${BASE}/admin/backup/runs/${id}/download`,
}
