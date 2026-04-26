package service

import (
	"strings"
	"testing"

	"golang.org/x/crypto/bcrypt"
)

func TestGenerateBackupCodes_ShapeAndUniqueness(t *testing.T) {
	plain, hashes, err := generateBackupCodes(10)
	if err != nil {
		t.Fatalf("generateBackupCodes returned error: %v", err)
	}
	if len(plain) != 10 || len(hashes) != 10 {
		t.Fatalf("expected 10 codes/hashes, got %d/%d", len(plain), len(hashes))
	}

	seen := make(map[string]struct{}, len(plain))
	for i, code := range plain {
		if len(code) != 8 {
			t.Errorf("code[%d] = %q has length %d, want 8", i, code, len(code))
		}
		if strings.ContainsAny(code, "01") {
			t.Errorf("code[%d] = %q contains base32 ambiguous chars", i, code)
		}
		if _, dup := seen[code]; dup {
			t.Errorf("duplicate code generated: %q", code)
		}
		seen[code] = struct{}{}

		// Each plaintext must verify against its paired bcrypt hash.
		if err := bcrypt.CompareHashAndPassword([]byte(hashes[i]), []byte(code)); err != nil {
			t.Errorf("code[%d] does not verify against its hash: %v", i, err)
		}
	}
}

func TestGenerateBackupCodes_HashesAreSaltedDistinct(t *testing.T) {
	// bcrypt produces a fresh salt per call, so two hashes of the same
	// plaintext must differ. This is what forces VerifyTOTPOrBackup to
	// list-and-compare instead of looking codes up by hash in SQL.
	a, _ := bcrypt.GenerateFromPassword([]byte("AAAAAAAA"), bcrypt.DefaultCost)
	b, _ := bcrypt.GenerateFromPassword([]byte("AAAAAAAA"), bcrypt.DefaultCost)
	if string(a) == string(b) {
		t.Fatal("expected bcrypt to produce distinct hashes for the same input; the verify path assumes per-row salts")
	}
}
