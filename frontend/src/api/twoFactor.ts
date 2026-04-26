import { api } from './client'
import type { User, AuthTokens } from './auth'

export interface TwoFactorStatus {
  enabled: boolean
  enrolled_at?: string
  backup_codes_remaining: number
}

export interface EnrollBeginResponse {
  secret: string
  otpauth_uri: string
  issuer: string
  account_name: string
}

export interface BackupCodesResponse {
  backup_codes: string[]
}

export interface CompleteLoginResponse {
  user: User
  tokens: AuthTokens
}

export const twoFactorApi = {
  getStatus: () =>
    api.get<TwoFactorStatus>('/users/me/2fa/status'),

  enrollBegin: () =>
    api.post<EnrollBeginResponse>('/users/me/2fa/enroll/begin', {}),

  enrollConfirm: (code: string) =>
    api.post<BackupCodesResponse>('/users/me/2fa/enroll/confirm', { code }),

  disable: (input: { password?: string; code?: string }) =>
    api.post<void>('/users/me/2fa/disable', input),

  regenerateBackupCodes: (code: string) =>
    api.post<BackupCodesResponse>('/users/me/2fa/backup-codes/regenerate', { code }),

  loginVerify2FA: (challengeToken: string, code: string) =>
    api.post<CompleteLoginResponse>('/auth/login/2fa', {
      challenge_token: challengeToken,
      code,
    }),
}
