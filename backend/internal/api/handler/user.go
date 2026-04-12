package handler

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type UserHandler struct {
	svc    *service.UserService
	social *service.SocialService
	images *repository.ImageRepository
}

func NewUser(svc *service.UserService, social *service.SocialService, images *repository.ImageRepository) *UserHandler {
	return &UserHandler{svc: svc, social: social, images: images}
}

// GET /api/v1/users/{id}
func (h *UserHandler) GetProfile(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Use viewer ID for follow enrichment; empty string for unauthenticated.
	viewerID, _ := middleware.UserIDFromContext(r.Context())

	profile, err := h.social.GetPublicProfile(r.Context(), id, viewerID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to fetch profile")
		return
	}
	writeJSON(w, http.StatusOK, profile)
}

// PATCH /api/v1/users/me
func (h *UserHandler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var in model.UpdateProfileInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	user, err := h.svc.UpdateMe(r.Context(), userID, &in)
	if err != nil {
		if errors.Is(err, service.ErrInvalidProfile) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to update profile")
		return
	}

	writeJSON(w, http.StatusOK, user)
}

// POST /api/v1/users/me/avatar
func (h *UserHandler) UploadAvatar(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	data, contentType, err := parseAndValidateImage(r, "image", 5<<20)
	if err != nil {
		if errors.Is(err, ErrFileTooLarge) {
			writeError(w, http.StatusBadRequest, "file too large (max 5MB)")
			return
		}
		if errors.Is(err, ErrMissingFile) {
			writeError(w, http.StatusBadRequest, "missing image file")
			return
		}
		if errors.Is(err, ErrUnsupportedType) {
			writeError(w, http.StatusBadRequest, "unsupported image type (use JPEG, PNG, or WebP)")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to read image")
		return
	}

	// Store image in database
	img, err := h.images.Create(r.Context(), userID, data, contentType)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to store image")
		return
	}

	// Update avatar_url on user
	avatarURL := fmt.Sprintf("/api/v1/images/%s", img.ID)
	user, err := h.svc.UpdateAvatarURL(r.Context(), userID, avatarURL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update avatar")
		return
	}

	writeJSON(w, http.StatusOK, user)
}

// POST /api/v1/users/me/email
func (h *UserHandler) RequestEmailChange(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var body struct {
		Email string `json:"email"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.svc.RequestEmailChange(r.Context(), userID, body.Email); err != nil {
		if errors.Is(err, service.ErrInvalidEmail) {
			writeError(w, http.StatusUnprocessableEntity, "invalid email address")
			return
		}
		if errors.Is(err, service.ErrEmailAlreadyInUse) {
			writeError(w, http.StatusConflict, "email already in use")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to request email change")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "confirmation email sent"})
}

// POST /api/v1/users/me/email/confirm
func (h *UserHandler) ConfirmEmailChange(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token string `json:"token"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	user, err := h.svc.ConfirmEmailChange(r.Context(), body.Token)
	if err != nil {
		if errors.Is(err, service.ErrInvalidEmailChangeToken) {
			writeError(w, http.StatusUnprocessableEntity, "invalid or expired token")
			return
		}
		if errors.Is(err, service.ErrEmailAlreadyInUse) {
			writeError(w, http.StatusConflict, "email already in use")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to confirm email change")
		return
	}

	writeJSON(w, http.StatusOK, user)
}
