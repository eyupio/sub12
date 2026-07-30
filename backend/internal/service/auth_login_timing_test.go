package service

import (
	"testing"

	"golang.org/x/crypto/bcrypt"
)

// TestDummyBcryptHash_MatchesDefaultCost verifies that the login timing-guard
// hash is a valid bcrypt hash at the same cost as real password hashes. If
// the cost drifted from bcrypt.DefaultCost, Login's response time on a
// missing account would no longer resemble the real-password path, and the
// user-enumeration side channel this hash exists to close would reopen.
func TestDummyBcryptHash_MatchesDefaultCost(t *testing.T) {
	if len(dummyBcryptHash) == 0 {
		t.Fatal("dummyBcryptHash is empty; login not-found path would skip bcrypt and leak account existence via timing")
	}
	cost, err := bcrypt.Cost(dummyBcryptHash)
	if err != nil {
		t.Fatalf("dummyBcryptHash is not a valid bcrypt hash: %v", err)
	}
	if cost != bcrypt.DefaultCost {
		t.Errorf("dummyBcryptHash cost = %d, want bcrypt.DefaultCost = %d", cost, bcrypt.DefaultCost)
	}
}

// TestDummyBcryptHash_NeverMatchesCommonPasswords verifies that a small
// sample of realistic attacker inputs never verifies against the dummy hash.
// The dummy plaintext is 32 bytes of crypto/rand output that we discard at
// init, so this is a smoke test for the guarantee, not the whole proof.
func TestDummyBcryptHash_NeverMatchesCommonPasswords(t *testing.T) {
	for _, candidate := range []string{
		"",
		"password",
		"admin",
		"123456",
		"correct horse battery staple",
	} {
		if err := bcrypt.CompareHashAndPassword(dummyBcryptHash, []byte(candidate)); err == nil {
			t.Errorf("dummyBcryptHash matched attacker-supplied candidate %q — dummy hash must never verify against a real login input", candidate)
		}
	}
}
