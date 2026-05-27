package handler

import (
	"errors"
	"net/http"
	"net/mail"
	"time"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/repository"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

// refreshCookieName is the httpOnly cookie that carries the opaque refresh
// token. It is scoped to /api/v1/auth so it is only sent on auth-bearing
// endpoints (refresh, logout) — never on the broader API surface.
const (
	refreshCookieName = "sub12_refresh"
	refreshCookiePath = "/api/v1/auth"
	refreshCookieTTL  = 30 * 24 * time.Hour
)

type AuthHandler struct {
	auth   *service.AuthService
	secure bool
}

// NewAuth builds the handler. `secureCookie` controls the Secure flag on the
// refresh cookie — true in production (HTTPS), false locally (HTTP).
func NewAuth(auth *service.AuthService, secureCookie bool) *AuthHandler {
	return &AuthHandler{auth: auth, secure: secureCookie}
}

func (h *AuthHandler) setRefreshCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     refreshCookieName,
		Value:    token,
		Path:     refreshCookiePath,
		Expires:  time.Now().Add(refreshCookieTTL),
		MaxAge:   int(refreshCookieTTL.Seconds()),
		HttpOnly: true,
		Secure:   h.secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (h *AuthHandler) clearRefreshCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     refreshCookieName,
		Value:    "",
		Path:     refreshCookiePath,
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   h.secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func readRefreshCookie(r *http.Request) string {
	c, err := r.Cookie(refreshCookieName)
	if err != nil || c == nil {
		return ""
	}
	return c.Value
}

// POST /api/v1/auth/register
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email       string `json:"email"`
		DisplayName string `json:"display_name"`
		Password    string `json:"password"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Email == "" || body.Password == "" || body.DisplayName == "" {
		writeError(w, http.StatusBadRequest, "email, display_name and password are required")
		return
	}
	if _, err := mail.ParseAddress(body.Email); err != nil {
		writeError(w, http.StatusBadRequest, "invalid email address")
		return
	}
	if len(body.Email) > 254 {
		writeError(w, http.StatusBadRequest, "email is too long")
		return
	}
	if len(body.DisplayName) > 64 {
		writeError(w, http.StatusBadRequest, "display_name must be 64 characters or fewer")
		return
	}
	if len(body.Password) < 8 {
		writeError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}
	if len(body.Password) > 128 {
		writeError(w, http.StatusBadRequest, "password is too long")
		return
	}

	user, tokens, err := h.auth.Register(r.Context(), body.Email, body.DisplayName, body.Password)
	if err != nil {
		if errors.Is(err, repository.ErrConflict) {
			writeError(w, http.StatusConflict, "email already registered")
			return
		}
		writeError(w, http.StatusInternalServerError, "registration failed")
		return
	}

	h.setRefreshCookie(w, tokens.RefreshToken)
	writeJSON(w, http.StatusCreated, map[string]any{
		"user":   user,
		"tokens": tokens,
	})
}

// POST /api/v1/auth/login
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	user, tokens, challenge, err := h.auth.Login(r.Context(), body.Email, body.Password)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCredentials) {
			writeError(w, http.StatusUnauthorized, "invalid email or password")
			return
		}
		writeError(w, http.StatusInternalServerError, "login failed")
		return
	}

	if challenge != "" {
		writeJSON(w, http.StatusOK, map[string]any{
			"requires_2fa":    true,
			"challenge_token": challenge,
			"user_id":         user.ID,
		})
		return
	}

	h.setRefreshCookie(w, tokens.RefreshToken)
	writeJSON(w, http.StatusOK, map[string]any{
		"user":   user,
		"tokens": tokens,
	})
}

// POST /api/v1/auth/login/2fa
// Exchanges a challenge token + TOTP/backup code for a full token pair.
func (h *AuthHandler) LoginVerify2FA(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ChallengeToken string `json:"challenge_token"`
		Code           string `json:"code"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.ChallengeToken == "" || body.Code == "" {
		writeError(w, http.StatusBadRequest, "challenge_token and code are required")
		return
	}

	user, tokens, err := h.auth.CompleteLoginWith2FA(r.Context(), body.ChallengeToken, body.Code)
	if err != nil {
		if errors.Is(err, service.ErrInvalidToken) {
			writeError(w, http.StatusUnauthorized, "challenge expired, please sign in again")
			return
		}
		if errors.Is(err, service.ErrInvalidTOTP) || errors.Is(err, service.ErrInvalidCredentials) {
			writeError(w, http.StatusUnauthorized, "invalid verification code")
			return
		}
		writeError(w, http.StatusInternalServerError, "login failed")
		return
	}

	h.setRefreshCookie(w, tokens.RefreshToken)
	writeJSON(w, http.StatusOK, map[string]any{
		"user":   user,
		"tokens": tokens,
	})
}

// GET /api/v1/me returns the authenticated user's id and role from the JWT context.
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID, okID := middleware.UserIDFromContext(r.Context())
	role, okRole := middleware.UserRoleFromContext(r.Context())
	if !okID || !okRole {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"user_id": userID, "role": role})
}

// POST /api/v1/auth/refresh
//
// Reads the refresh token from the httpOnly cookie set by login/register.
// Falls back to a JSON body for backwards compatibility with clients that
// have not migrated yet; the body path will be removed once all clients are
// using the cookie.
func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	token := readRefreshCookie(r)
	if token == "" {
		var body struct {
			RefreshToken string `json:"refresh_token"`
		}
		if err := decodeJSON(r, &body); err == nil {
			token = body.RefreshToken
		}
	}
	if token == "" {
		writeError(w, http.StatusUnauthorized, "missing refresh token")
		return
	}

	tokens, err := h.auth.Refresh(r.Context(), token)
	if err != nil {
		// Drop any stale cookie so the browser stops re-presenting it.
		h.clearRefreshCookie(w)
		writeError(w, http.StatusUnauthorized, "invalid or expired refresh token")
		return
	}

	h.setRefreshCookie(w, tokens.RefreshToken)
	writeJSON(w, http.StatusOK, tokens)
}

// POST /api/v1/auth/logout
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	token := readRefreshCookie(r)
	if token == "" {
		var body struct {
			RefreshToken string `json:"refresh_token"`
		}
		if err := decodeJSON(r, &body); err == nil {
			token = body.RefreshToken
		}
	}
	if token != "" {
		h.auth.Logout(r.Context(), token)
	}
	h.clearRefreshCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/auth/forgot-password
func (h *AuthHandler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email string `json:"email"`
	}
	if err := decodeJSON(r, &body); err != nil || body.Email == "" {
		writeError(w, http.StatusBadRequest, "email is required")
		return
	}
	if _, err := mail.ParseAddress(body.Email); err != nil {
		writeError(w, http.StatusBadRequest, "invalid email address")
		return
	}
	_ = h.auth.RequestPasswordReset(r.Context(), body.Email)
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"message": "If an account exists for that email, a reset link has been sent.",
	})
}

// POST /api/v1/auth/reset-password
func (h *AuthHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token       string `json:"token"`
		NewPassword string `json:"new_password"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Token == "" || body.NewPassword == "" {
		writeError(w, http.StatusBadRequest, "token and new_password are required")
		return
	}
	if len(body.NewPassword) < 8 {
		writeError(w, http.StatusBadRequest, "new_password must be at least 8 characters")
		return
	}
	if len(body.NewPassword) > 128 {
		writeError(w, http.StatusBadRequest, "new_password is too long")
		return
	}

	if err := h.auth.ResetPassword(r.Context(), body.Token, body.NewPassword); err != nil {
		if errors.Is(err, service.ErrInvalidResetToken) {
			writeError(w, http.StatusBadRequest, "invalid or expired reset token")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to reset password")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
