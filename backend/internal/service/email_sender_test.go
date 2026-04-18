package service

import (
	"strings"
	"testing"
)

func TestBuildMultipartMsg_RejectsCRLFInFromHeader(t *testing.T) {
	malicious := "Attacker\r\nBcc: victim@example.com <attacker@example.com>"
	if _, err := buildMultipartMsg(malicious, "to@example.com", "Subject", "t", "<p>h</p>"); err == nil {
		t.Fatal("expected header injection via From to be rejected")
	}
}

func TestBuildMultipartMsg_RejectsCRLFInSubject(t *testing.T) {
	maliciousSubject := "Hello\r\nBcc: attacker@example.com"
	if _, err := buildMultipartMsg("from@example.com", "to@example.com", maliciousSubject, "t", "<p>h</p>"); err == nil {
		t.Fatal("expected header injection via Subject to be rejected")
	}
}

func TestBuildMultipartMsg_RejectsBareLFInTo(t *testing.T) {
	maliciousTo := "to@example.com\nBcc: attacker@example.com"
	if _, err := buildMultipartMsg("from@example.com", maliciousTo, "Subject", "t", "<p>h</p>"); err == nil {
		t.Fatal("expected header injection via To to be rejected")
	}
}

func TestBuildMultipartMsg_SafeInput(t *testing.T) {
	msg, err := buildMultipartMsg("sub12 <no-reply@sub12.io>", "user@example.com", "Hello", "text body", "<p>html</p>")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got := string(msg)
	for _, want := range []string{
		"From: sub12 <no-reply@sub12.io>\r\n",
		"To: user@example.com\r\n",
		"Subject: Hello\r\n",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("message missing header %q\n---\n%s", want, got)
		}
	}
}
