package handler

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNormaliseImageType(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		wantType string
		wantOK   bool
	}{
		{"jpeg", "image/jpeg", "image/jpeg", true},
		{"jpeg with params", "image/jpeg; charset=utf-8", "image/jpeg", true},
		{"png", "image/png", "image/png", true},
		{"webp", "image/webp", "image/webp", true},
		{"heic", "image/heic", "image/jpeg", true},
		{"heif", "image/heif", "image/jpeg", true},
		{"octet-stream", "application/octet-stream", "image/jpeg", true},
		{"JPEG uppercase", "Image/JPEG", "image/jpeg", true},
		{"gif rejected", "image/gif", "", false},
		{"text rejected", "text/plain", "", false},
		{"pdf rejected", "application/pdf", "", false},
		{"empty rejected", "", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := normaliseImageType(tt.input)
			assert.Equal(t, tt.wantOK, ok)
			if ok {
				assert.Equal(t, tt.wantType, got)
			}
		})
	}
}
