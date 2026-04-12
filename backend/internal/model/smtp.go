package model

import "time"

type SMTPSettings struct {
	ID                int16     `json:"id"`
	Host              string    `json:"host"`
	Port              int       `json:"port"`
	Username          *string   `json:"username,omitempty"`
	PasswordEncrypted *string   `json:"-"`
	FromEmail         string    `json:"from_email"`
	FromName          *string   `json:"from_name,omitempty"`
	UseTLS            bool      `json:"use_tls"`
	UseSTARTTLS       bool      `json:"use_starttls"`
	UpdatedBy         *string   `json:"updated_by,omitempty"`
	UpdatedAt         time.Time `json:"updated_at"`
}

type SMTPSettingsResponse struct {
	ID          int16     `json:"id"`
	Host        string    `json:"host"`
	Port        int       `json:"port"`
	Username    *string   `json:"username,omitempty"`
	FromEmail   string    `json:"from_email"`
	FromName    *string   `json:"from_name,omitempty"`
	UseTLS      bool      `json:"use_tls"`
	UseSTARTTLS bool      `json:"use_starttls"`
	HasPassword bool      `json:"has_password"`
	UpdatedBy   *string   `json:"updated_by,omitempty"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type UpsertSMTPSettingsInput struct {
	Host              string  `json:"host"`
	Port              int     `json:"port"`
	Username          *string `json:"username"`
	PasswordEncrypted *string `json:"password_encrypted"`
	FromEmail         string  `json:"from_email"`
	FromName          *string `json:"from_name"`
	UseTLS            bool    `json:"use_tls"`
	UseSTARTTLS       bool    `json:"use_starttls"`
}

func (s *SMTPSettings) ToResponse() *SMTPSettingsResponse {
	if s == nil {
		return nil
	}
	return &SMTPSettingsResponse{
		ID:          s.ID,
		Host:        s.Host,
		Port:        s.Port,
		Username:    s.Username,
		FromEmail:   s.FromEmail,
		FromName:    s.FromName,
		UseTLS:      s.UseTLS,
		UseSTARTTLS: s.UseSTARTTLS,
		HasPassword: s.PasswordEncrypted != nil && *s.PasswordEncrypted != "",
		UpdatedBy:   s.UpdatedBy,
		UpdatedAt:   s.UpdatedAt,
	}
}
