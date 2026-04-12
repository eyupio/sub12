package model

import "time"

type EmailTemplate struct {
	Key             string    `json:"key"`
	SubjectTemplate string    `json:"subject_template"`
	HTMLTemplate    string    `json:"html_template"`
	TextTemplate    string    `json:"text_template"`
	IsEnabled       bool      `json:"is_enabled"`
	UpdatedBy       *string   `json:"updated_by,omitempty"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type UpdateEmailTemplateInput struct {
	SubjectTemplate *string `json:"subject_template"`
	HTMLTemplate    *string `json:"html_template"`
	TextTemplate    *string `json:"text_template"`
	IsEnabled       *bool   `json:"is_enabled"`
}

type EmailTemplatePreviewInput struct {
	Payload map[string]any `json:"payload"`
}

type RenderedEmailTemplate struct {
	Subject string `json:"subject"`
	HTML    string `json:"html"`
	Text    string `json:"text"`
}
