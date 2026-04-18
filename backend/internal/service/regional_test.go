package service

import "testing"

func TestIsValidDateFormat(t *testing.T) {
	cases := map[string]bool{
		"dmy_slash": true,
		"mdy_slash": true,
		"ymd_dash":  true,
		"dmy_short": true,
		"":          false,
		"iso":       false,
		"DMY_SLASH": false,
	}
	for v, want := range cases {
		if got := IsValidDateFormat(v); got != want {
			t.Errorf("IsValidDateFormat(%q) = %v, want %v", v, got, want)
		}
	}
}

func TestIsValidTimeFormat(t *testing.T) {
	cases := map[string]bool{
		"24h":  true,
		"12h":  true,
		"":     false,
		"24":   false,
		"AMPM": false,
	}
	for v, want := range cases {
		if got := IsValidTimeFormat(v); got != want {
			t.Errorf("IsValidTimeFormat(%q) = %v, want %v", v, got, want)
		}
	}
}

func TestIsValidTimezone(t *testing.T) {
	valid := []string{"Europe/London", "America/New_York", "UTC", "Australia/Sydney"}
	for _, tz := range valid {
		if !IsValidTimezone(tz) {
			t.Errorf("IsValidTimezone(%q) = false, want true", tz)
		}
	}

	invalid := []string{
		"",
		"Not/A/Real/Zone",
		"Europe/London; DROP TABLE users",
		"../../etc/passwd",
	}
	for _, tz := range invalid {
		if IsValidTimezone(tz) {
			t.Errorf("IsValidTimezone(%q) = true, want false", tz)
		}
	}

	// Reject overlong strings even if they look well-formed.
	long := ""
	for i := 0; i < 65; i++ {
		long += "A"
	}
	if IsValidTimezone(long) {
		t.Errorf("IsValidTimezone(65-char input) = true, want false")
	}
}
