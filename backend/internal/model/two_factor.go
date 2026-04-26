package model

import "time"

// TOTPEnrollBegin is returned when a user starts 2FA enrollment.
// The QR code is rendered client-side from OtpauthURI; Secret is shown
// as a fallback for users who can't scan.
type TOTPEnrollBegin struct {
	Secret      string `json:"secret"`
	OtpauthURI  string `json:"otpauth_uri"`
	Issuer      string `json:"issuer"`
	AccountName string `json:"account_name"`
}

type TOTPEnrollConfirmRequest struct {
	Code string `json:"code"`
}

// TOTPDisableRequest accepts either the user's current password or a
// current TOTP/backup code to re-authenticate the disable action.
type TOTPDisableRequest struct {
	Password string `json:"password,omitempty"`
	Code     string `json:"code,omitempty"`
}

type TOTPVerifyLoginRequest struct {
	ChallengeToken string `json:"challenge_token"`
	Code           string `json:"code"`
}

type TOTPStatus struct {
	Enabled              bool       `json:"enabled"`
	EnrolledAt           *time.Time `json:"enrolled_at,omitempty"`
	BackupCodesRemaining int        `json:"backup_codes_remaining"`
}

type BackupCodesResponse struct {
	Codes []string `json:"codes"`
}
