package model

import (
	"strings"
	"testing"
)

func TestCreateAnnouncementInput_Normalise(t *testing.T) {
	tests := []struct {
		name    string
		in      CreateAnnouncementInput
		wantErr string
	}{
		{"trims and accepts", CreateAnnouncementInput{Title: "  Range closed  ", Body: " Gates locked Sunday. "}, ""},
		{"title required", CreateAnnouncementInput{Title: "   ", Body: "text"}, "title is required"},
		{"body required", CreateAnnouncementInput{Title: "Title", Body: "  "}, "body is required"},
		{"title too long", CreateAnnouncementInput{Title: strings.Repeat("a", AnnouncementTitleMaxLen+1), Body: "text"}, "title is too long"},
		{"body too long", CreateAnnouncementInput{Title: "Title", Body: strings.Repeat("a", AnnouncementBodyMaxLen+1)}, "body is too long"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			in := tc.in
			if got := in.Normalise(); got != tc.wantErr {
				t.Fatalf("Normalise() = %q, want %q", got, tc.wantErr)
			}
			if tc.wantErr == "" {
				if in.Title != "Range closed" || in.Body != "Gates locked Sunday." {
					t.Errorf("input not trimmed in place: %q / %q", in.Title, in.Body)
				}
			}
		})
	}
}

// A multi-byte body must not be cut mid-rune, and a short one must come back
// untouched rather than gaining an ellipsis.
func TestAnnouncementBodyPreview(t *testing.T) {
	short := &Announcement{Body: "Gates locked Sunday."}
	if got := short.BodyPreview(); got != short.Body {
		t.Errorf("short body: got %q, want it unchanged", got)
	}

	long := &Announcement{Body: strings.Repeat("é", AnnouncementPreviewLen+50)}
	preview := long.BodyPreview()
	runes := []rune(preview)
	if len(runes) != AnnouncementPreviewLen+1 {
		t.Errorf("preview length: got %d runes, want %d plus the ellipsis", len(runes), AnnouncementPreviewLen)
	}
	if runes[len(runes)-1] != '…' {
		t.Errorf("truncated preview should end in an ellipsis, got %q", preview)
	}
	if !strings.HasPrefix(long.Body, string(runes[:AnnouncementPreviewLen])) {
		t.Error("preview is not a prefix of the body — a rune was split")
	}
}
