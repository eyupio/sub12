package service

import (
	"bytes"
	"context"
	"crypto/rsa"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/rs/zerolog"
)

const (
	fcmScope        = "https://www.googleapis.com/auth/firebase.messaging"
	fcmSendEndpoint = "https://fcm.googleapis.com/v1/projects/%s/messages:send"
	fcmDefaultToken = "https://oauth2.googleapis.com/token"
)

// fcmServiceAccount mirrors the subset of a Google service-account JSON file
// needed to mint an OAuth2 access token for FCM.
type fcmServiceAccount struct {
	ProjectID   string `json:"project_id"`
	ClientEmail string `json:"client_email"`
	PrivateKey  string `json:"private_key"`
	TokenURI    string `json:"token_uri"`
}

// fcmSender is a PushSender backed by Firebase Cloud Messaging (HTTP v1). It
// mints a short-lived OAuth2 access token from the service account (cached until
// expiry) and POSTs one message per device token.
type fcmSender struct {
	projectID   string
	clientEmail string
	tokenURI    string
	privateKey  *rsa.PrivateKey
	httpClient  *http.Client
	logger      zerolog.Logger

	mu        sync.Mutex
	token     string
	tokenExp  time.Time
}

// NewFCMSender builds an FCM PushSender from a service-account JSON string.
// Returns an error when required fields are missing or the private key can't be
// parsed, so the caller can fall back to the no-op sender.
func NewFCMSender(credentialsJSON string, logger zerolog.Logger) (PushSender, error) {
	var sa fcmServiceAccount
	if err := json.Unmarshal([]byte(credentialsJSON), &sa); err != nil {
		return nil, fmt.Errorf("parse FCM credentials: %w", err)
	}
	if sa.ProjectID == "" || sa.ClientEmail == "" || sa.PrivateKey == "" {
		return nil, errors.New("FCM credentials missing project_id, client_email, or private_key")
	}
	key, err := jwt.ParseRSAPrivateKeyFromPEM([]byte(sa.PrivateKey))
	if err != nil {
		return nil, fmt.Errorf("parse FCM private key: %w", err)
	}
	tokenURI := sa.TokenURI
	if tokenURI == "" {
		tokenURI = fcmDefaultToken
	}
	return &fcmSender{
		projectID:   sa.ProjectID,
		clientEmail: sa.ClientEmail,
		tokenURI:    tokenURI,
		privateKey:  key,
		httpClient:  &http.Client{Timeout: 10 * time.Second},
		logger:      logger,
	}, nil
}

func (s *fcmSender) Send(ctx context.Context, tokens []string, msg PushMessage) {
	if len(tokens) == 0 {
		return
	}
	accessToken, err := s.accessToken(ctx)
	if err != nil {
		s.logger.Warn().Err(err).Msg("FCM access token failed; skipping push delivery")
		return
	}
	endpoint := fmt.Sprintf(fcmSendEndpoint, s.projectID)
	for _, t := range tokens {
		if err := s.sendOne(ctx, endpoint, accessToken, t, msg); err != nil {
			s.logger.Warn().Err(err).Msg("FCM send failed")
		}
	}
}

func (s *fcmSender) sendOne(ctx context.Context, endpoint, accessToken, deviceToken string, msg PushMessage) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(buildFCMPayload(deviceToken, msg)))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return fmt.Errorf("fcm status %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	return nil
}

// buildFCMPayload constructs an FCM HTTP v1 message body for a single token.
func buildFCMPayload(deviceToken string, msg PushMessage) []byte {
	message := map[string]any{
		"token": deviceToken,
		"notification": map[string]any{
			"title": msg.Title,
			"body":  msg.Body,
		},
	}
	if len(msg.Data) > 0 {
		message["data"] = msg.Data
	}
	b, _ := json.Marshal(map[string]any{"message": message})
	return b
}

// accessToken returns a cached OAuth2 access token, minting a new one (via the
// JWT-bearer grant) when none is cached or the current one is near expiry.
func (s *fcmSender) accessToken(ctx context.Context) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.token != "" && time.Now().Before(s.tokenExp) {
		return s.token, nil
	}
	assertion, err := s.signAssertion(time.Now())
	if err != nil {
		return "", err
	}
	form := url.Values{}
	form.Set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer")
	form.Set("assertion", assertion)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.tokenURI, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return "", fmt.Errorf("oauth status %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	var tr struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tr); err != nil {
		return "", err
	}
	if tr.AccessToken == "" {
		return "", errors.New("empty access token in oauth response")
	}
	s.token = tr.AccessToken
	// Refresh a minute early to avoid using a token that expires mid-request.
	s.tokenExp = time.Now().Add(time.Duration(tr.ExpiresIn-60) * time.Second)
	return s.token, nil
}

// signAssertion builds and signs the RS256 JWT assertion exchanged for an
// access token at the OAuth2 token endpoint.
func (s *fcmSender) signAssertion(now time.Time) (string, error) {
	claims := jwt.MapClaims{
		"iss":   s.clientEmail,
		"scope": fcmScope,
		"aud":   s.tokenURI,
		"iat":   now.Unix(),
		"exp":   now.Add(time.Hour).Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodRS256, claims).SignedString(s.privateKey)
}
