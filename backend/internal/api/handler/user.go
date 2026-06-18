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

// GET /api/v1/users?q=...&limit=...
func (h *UserHandler) SearchUsers(w http.ResponseWriter, r *http.Request) {
	viewerID, _ := middleware.UserIDFromContext(r.Context())
	q := r.URL.Query().Get("q")

	limit, _ := parsePagination(r, 20, 100)

	results, err := h.svc.SearchUsers(r.Context(), q, viewerID, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to search users")
		return
	}
	if results == nil {
		results = []*model.PublicProfile{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": results})
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

// DELETE /api/v1/users/me
func (h *UserHandler) DeleteMe(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if err := h.svc.RequestDeletion(r.Context(), userID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "account not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete account")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/users/me/export
//
// Returns a downloadable JSON blob containing the requesting user's core
// records (profile, score cards, posts, clubs, leagues). The export is
// produced synchronously — the `data_export_requests` table records the
// audit trail for later review.
func (h *UserHandler) RequestExport(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	payload, err := h.svc.ExportData(r.Context(), userID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "account not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to export data")
		return
	}
	w.Header().Set("Content-Disposition", `attachment; filename="sub12-data-export.json"`)
	writeJSON(w, http.StatusOK, payload)
}

// GET /api/v1/users/me/export/{id}
//
// Placeholder for future asynchronous exports. For now we return 410 Gone
// — exports are delivered synchronously by POST /users/me/export. The
// route is kept so the client can still poll by ID without a 404 surprise
// once async processing lands.
func (h *UserHandler) GetExport(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusGone, "exports are delivered synchronously via POST /users/me/export")
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
