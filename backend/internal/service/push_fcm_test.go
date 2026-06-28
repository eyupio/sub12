package service

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/rs/zerolog"
)

func testServiceAccountJSON(t *testing.T) (string, *rsa.PrivateKey) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	pemBytes := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(key),
	})
	sa := map[string]string{
		"type":         "service_account",
		"project_id":   "sub12-test",
		"client_email": "fcm@sub12-test.iam.gserviceaccount.com",
		"private_key":  string(pemBytes),
		"token_uri":    "https://oauth2.googleapis.com/token",
	}
	b, err := json.Marshal(sa)
	if err != nil {
		t.Fatalf("marshal sa: %v", err)
	}
	return string(b), key
}

func TestNewFCMSender_Errors(t *testing.T) {
	if _, err := NewFCMSender("not json", zerolog.Nop()); err == nil {
		t.Fatal("expected error for invalid JSON")
	}
	if _, err := NewFCMSender(`{"project_id":"p"}`, zerolog.Nop()); err == nil {
		t.Fatal("expected error for missing client_email/private_key")
	}
	if _, err := NewFCMSender(`{"project_id":"p","client_email":"e","private_key":"not a key"}`, zerolog.Nop()); err == nil {
		t.Fatal("expected error for unparseable private key")
	}
}

func TestNewFCMSender_SignsVerifiableAssertion(t *testing.T) {
	credJSON, key := testServiceAccountJSON(t)
	sender, err := NewFCMSender(credJSON, zerolog.Nop())
	if err != nil {
		t.Fatalf("NewFCMSender: %v", err)
	}
	fs, ok := sender.(*fcmSender)
	if !ok {
		t.Fatalf("expected *fcmSender, got %T", sender)
	}

	assertion, err := fs.signAssertion(time.Now())
	if err != nil {
		t.Fatalf("signAssertion: %v", err)
	}

	parsed, err := jwt.Parse(assertion, func(token *jwt.Token) (any, error) {
		return &key.PublicKey, nil
	})
	if err != nil || !parsed.Valid {
		t.Fatalf("assertion did not verify: %v", err)
	}
	claims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		t.Fatalf("unexpected claims type %T", parsed.Claims)
	}
	if claims["iss"] != "fcm@sub12-test.iam.gserviceaccount.com" {
		t.Errorf("iss = %v", claims["iss"])
	}
	if claims["scope"] != fcmScope {
		t.Errorf("scope = %v", claims["scope"])
	}
	if claims["aud"] != "https://oauth2.googleapis.com/token" {
		t.Errorf("aud = %v", claims["aud"])
	}
}

func TestBuildFCMPayload(t *testing.T) {
	body := buildFCMPayload("device-xyz", PushMessage{
		Title: "New follower",
		Body:  "Alice is now following you.",
		Data:  map[string]string{"type": "follow_accepted", "target_id": "u1"},
	})

	var got struct {
		Message struct {
			Token        string            `json:"token"`
			Notification struct{ Title, Body string } `json:"notification"`
			Data         map[string]string `json:"data"`
		} `json:"message"`
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("unmarshal payload: %v", err)
	}
	if got.Message.Token != "device-xyz" {
		t.Errorf("token = %q", got.Message.Token)
	}
	if got.Message.Notification.Title != "New follower" || got.Message.Notification.Body == "" {
		t.Errorf("notification = %+v", got.Message.Notification)
	}
	if got.Message.Data["type"] != "follow_accepted" || got.Message.Data["target_id"] != "u1" {
		t.Errorf("data = %+v", got.Message.Data)
	}
}

func TestBuildFCMPayload_OmitsEmptyData(t *testing.T) {
	body := buildFCMPayload("d", PushMessage{Title: "t", Body: "b"})
	var raw map[string]any
	if err := json.Unmarshal(body, &raw); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	msg := raw["message"].(map[string]any)
	if _, present := msg["data"]; present {
		t.Errorf("data should be omitted when empty: %v", msg)
	}
}
