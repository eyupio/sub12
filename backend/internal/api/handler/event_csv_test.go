package handler

import "testing"

func TestCsvSafeNeutralisesFormulaPrefixes(t *testing.T) {
	cases := map[string]string{
		"":                  "",
		"Alice":             "Alice",
		"=HYPERLINK(\"x\")": "'=HYPERLINK(\"x\")",
		"+1":                "'+1",
		"-2":                "'-2",
		"@SUM(A1)":          "'@SUM(A1)",
		"\tcmd":             "'\tcmd",
		"Team = Best":       "Team = Best",
	}
	for in, want := range cases {
		if got := csvSafe(in); got != want {
			t.Errorf("csvSafe(%q) = %q, want %q", in, got, want)
		}
	}
}
