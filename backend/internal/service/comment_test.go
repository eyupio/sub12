package service

import (
	"context"
	"strings"
	"testing"
)

// validateBody is pure — no repos touched, no mocks needed.

func TestValidateBodyRejectsEmpty(t *testing.T) {
	s := &CommentService{}
	_, err := s.validateBody("")
	if err != ErrCommentEmpty {
		t.Fatalf("got %v, want ErrCommentEmpty", err)
	}
}

func TestValidateBodyRejectsWhitespaceOnly(t *testing.T) {
	s := &CommentService{}
	_, err := s.validateBody("   \t\n  ")
	if err != ErrCommentEmpty {
		t.Fatalf("got %v, want ErrCommentEmpty", err)
	}
}

func TestValidateBodyTrimsLeadingAndTrailingWhitespace(t *testing.T) {
	s := &CommentService{}
	got, err := s.validateBody("  hello  ")
	if err != nil || got != "hello" {
		t.Fatalf("got (%q, %v), want (\"hello\", nil)", got, err)
	}
}

func TestValidateBodyAcceptsExactRuneLimit(t *testing.T) {
	s := &CommentService{}
	if _, err := s.validateBody(strings.Repeat("x", 2000)); err != nil {
		t.Fatalf("2000-rune body must be accepted, got %v", err)
	}
}

func TestValidateBodyRejectsOneRuneOverLimit(t *testing.T) {
	s := &CommentService{}
	_, err := s.validateBody(strings.Repeat("x", 2001))
	if err != ErrCommentTooLong {
		t.Fatalf("got %v, want ErrCommentTooLong", err)
	}
}

func TestValidateBodyCountsRunesNotBytes(t *testing.T) {
	// 🎯 is one rune (4 bytes). 2001 emojis = 2001 runes → exceeds the limit.
	s := &CommentService{}
	_, err := s.validateBody(strings.Repeat("🎯", 2001))
	if err != ErrCommentTooLong {
		t.Fatalf("got %v, want ErrCommentTooLong for 2001-emoji body", err)
	}
}

// CanModerateComment has DB-free short-circuits for admins and anonymous callers.

func TestCanModerateCommentAdminGetsGlobalScope(t *testing.T) {
	s := &CommentService{}
	scope, err := s.CanModerateComment(context.Background(), "u1", "admin", "c1")
	if err != nil || scope.Scope != "global" {
		t.Fatalf("got (scope=%q, err=%v), want (global, nil)", scope.Scope, err)
	}
}

func TestCanModerateCommentAnonymousGetsNoScope(t *testing.T) {
	s := &CommentService{}
	scope, err := s.CanModerateComment(context.Background(), "", "member", "c1")
	if err != nil || scope.Scope != "" {
		t.Fatalf("got (scope=%q, err=%v), want ('', nil)", scope.Scope, err)
	}
}

// FlagComment validates the reason before any DB call; empty/whitespace returns early.

func TestFlagCommentRejectsEmptyReason(t *testing.T) {
	s := &CommentService{}
	if err := s.FlagComment(context.Background(), "u1", "admin", "c1", ""); err != ErrCommentFlagReasonEmpty {
		t.Fatalf("got %v, want ErrCommentFlagReasonEmpty", err)
	}
}

func TestFlagCommentRejectsWhitespaceOnlyReason(t *testing.T) {
	s := &CommentService{}
	if err := s.FlagComment(context.Background(), "u1", "admin", "c1", "   "); err != ErrCommentFlagReasonEmpty {
		t.Fatalf("got %v, want ErrCommentFlagReasonEmpty", err)
	}
}
