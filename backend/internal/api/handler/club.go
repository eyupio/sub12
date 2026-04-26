package handler

import (
	"errors"
	"fmt"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type ClubHandler struct {
	svc     *service.ClubService
	leagues *service.LeagueService
	images  *repository.ImageRepository
}

func NewClub(svc *service.ClubService, leagues *service.LeagueService, images *repository.ImageRepository) *ClubHandler {
	return &ClubHandler{svc: svc, leagues: leagues, images: images}
}

// GET /api/v1/clubs
// GET /api/v1/clubs
// Optional ?code=XYZ resolves a single club by join_code (case-insensitive),
// including private clubs, so codes work as discovery handles.
func (h *ClubHandler) List(w http.ResponseWriter, r *http.Request) {
	viewerID, _ := middleware.UserIDFromContext(r.Context())

	if code := r.URL.Query().Get("code"); code != "" {
		club, err := h.svc.LookupByJoinCode(r.Context(), code, viewerID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to look up club")
			return
		}
		items := []*model.Club{}
		if club != nil {
			items = append(items, club)
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": items})
		return
	}

	clubs, err := h.svc.List(r.Context(), viewerID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list clubs")
		return
	}
	if clubs == nil {
		clubs = []*model.Club{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": clubs})
}

// GET /api/v1/users/me/clubs
func (h *ClubHandler) ListMine(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	clubs, err := h.svc.ListByUser(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list my clubs")
		return
	}
	if clubs == nil {
		clubs = []*model.Club{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": clubs})
}

// GET /api/v1/clubs/{id}
func (h *ClubHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	clubID := chi.URLParam(r, "id")
	viewerID, _ := middleware.UserIDFromContext(r.Context())
	viewerRole, _ := middleware.UserRoleFromContext(r.Context())

	club, err := h.svc.GetByID(r.Context(), clubID, viewerID, viewerRole)
	if err != nil {
		if errors.Is(err, service.ErrClubNotFound) {
			writeError(w, http.StatusNotFound, "club not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to get club")
		return
	}
	writeJSON(w, http.StatusOK, club)
}

// GET /api/v1/clubs/{id}/summary - minimal info for rendering the
// members-only banner on private clubs.
func (h *ClubHandler) Summary(w http.ResponseWriter, r *http.Request) {
	clubID := chi.URLParam(r, "id")
	summary, err := h.svc.SummaryByID(r.Context(), clubID)
	if err != nil {
		if errors.Is(err, service.ErrClubNotFound) {
			writeError(w, http.StatusNotFound, "club not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to get club summary")
		return
	}
	writeJSON(w, http.StatusOK, summary)
}

// POST /api/v1/clubs
func (h *ClubHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var input model.CreateClubInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	club, err := h.svc.Create(r.Context(), userID, &input)
	if err != nil {
		if errors.Is(err, service.ErrInvalidClub) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to create club")
		return
	}
	writeJSON(w, http.StatusCreated, club)
}

// PATCH /api/v1/clubs/{id}
func (h *ClubHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	clubID := chi.URLParam(r, "id")

	var in model.UpdateClubInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	club, err := h.svc.UpdateClub(r.Context(), clubID, userID, &in)
	if err != nil {
		if errors.Is(err, service.ErrClubNotAdmin) {
			writeError(w, http.StatusForbidden, "admin access required")
			return
		}
		if errors.Is(err, service.ErrInvalidClub) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if errors.Is(err, service.ErrClubNotFound) {
			writeError(w, http.StatusNotFound, "club not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to update club")
		return
	}
	writeJSON(w, http.StatusOK, club)
}

// POST /api/v1/clubs/{id}/join-code
func (h *ClubHandler) RegenerateJoinCode(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	clubID := chi.URLParam(r, "id")

	code, err := h.svc.RegenerateJoinCode(r.Context(), clubID, userID)
	if err != nil {
		if errors.Is(err, service.ErrClubNotAdmin) {
			writeError(w, http.StatusForbidden, "admin access required")
			return
		}
		if errors.Is(err, service.ErrClubNotFound) {
			writeError(w, http.StatusNotFound, "club not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to regenerate join code")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"join_code": code})
}

// DELETE /api/v1/clubs/{id}/members/me
func (h *ClubHandler) Leave(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	clubID := chi.URLParam(r, "id")

	if err := h.svc.LeaveClub(r.Context(), clubID, userID); err != nil {
		if errors.Is(err, service.ErrClubNotMember) {
			writeError(w, http.StatusNotFound, "not a member of this club")
			return
		}
		if errors.Is(err, service.ErrClubLastAdmin) {
			writeError(w, http.StatusConflict, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to leave club")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// PATCH /api/v1/clubs/{id}/members/{userId}
func (h *ClubHandler) UpdateMember(w http.ResponseWriter, r *http.Request) {
	requesterID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	clubID := chi.URLParam(r, "id")
	targetID := chi.URLParam(r, "userId")

	var in model.UpdateClubMemberInput
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if in.IsAdmin == nil {
		writeError(w, http.StatusBadRequest, "is_admin field is required")
		return
	}

	if err := h.svc.UpdateMemberRole(r.Context(), clubID, requesterID, targetID, *in.IsAdmin); err != nil {
		if errors.Is(err, service.ErrClubNotAdmin) {
			writeError(w, http.StatusForbidden, "admin access required")
			return
		}
		if errors.Is(err, service.ErrClubLastAdmin) {
			writeError(w, http.StatusConflict, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to update member")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"updated": true})
}

// POST /api/v1/clubs/{id}/join
func (h *ClubHandler) Join(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	clubID := chi.URLParam(r, "id")

	var body struct {
		JoinCode string `json:"join_code"`
	}
	// Empty body is allowed (open-policy clubs don't need a join code); any
	// other decode failure is a malformed request.
	if err := decodeJSON(r, &body); err != nil && !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	joined, pending, err := h.svc.Join(r.Context(), clubID, userID, body.JoinCode)
	if err != nil {
		if errors.Is(err, service.ErrClubNotFound) {
			writeError(w, http.StatusNotFound, "club not found")
			return
		}
		if errors.Is(err, service.ErrClubAlreadyMember) {
			writeError(w, http.StatusConflict, "already a member of this club")
			return
		}
		if errors.Is(err, service.ErrClubInvalidCode) {
			writeError(w, http.StatusForbidden, "invalid or missing join code")
			return
		}
		if errors.Is(err, service.ErrClubPendingRequest) {
			writeError(w, http.StatusConflict, "join request already pending")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to join club")
		return
	}
	if pending {
		writeJSON(w, http.StatusAccepted, map[string]any{"pending": true})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"joined": joined})
}

// GET /api/v1/clubs/{id}/members
func (h *ClubHandler) ListMembers(w http.ResponseWriter, r *http.Request) {
	viewerID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	viewerRole, _ := middleware.UserRoleFromContext(r.Context())

	clubID := chi.URLParam(r, "id")
	members, err := h.svc.ListMembers(r.Context(), clubID, viewerID, viewerRole)
	if err != nil {
		if errors.Is(err, service.ErrClubNotFound) {
			writeError(w, http.StatusNotFound, "club not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to list members")
		return
	}
	if members == nil {
		members = []*model.ClubMember{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": members})
}

// GET /api/v1/clubs/{id}/standings
func (h *ClubHandler) GetStandings(w http.ResponseWriter, r *http.Request) {
	viewerID, _ := middleware.UserIDFromContext(r.Context())
	viewerRole, _ := middleware.UserRoleFromContext(r.Context())
	clubID := chi.URLParam(r, "id")
	standings, err := h.svc.GetStandings(r.Context(), clubID, viewerID, viewerRole)
	if err != nil {
		if errors.Is(err, service.ErrClubNotFound) {
			writeError(w, http.StatusNotFound, "club not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to get standings")
		return
	}
	if standings == nil {
		standings = []*model.ClubStanding{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": standings})
}

// GET /api/v1/clubs/{id}/join-requests
func (h *ClubHandler) ListJoinRequests(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	clubID := chi.URLParam(r, "id")
	status := r.URL.Query().Get("status")

	requests, err := h.svc.ListJoinRequests(r.Context(), clubID, userID, status)
	if err != nil {
		if errors.Is(err, service.ErrClubNotAdmin) {
			writeError(w, http.StatusForbidden, "admin access required")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to list join requests")
		return
	}
	if requests == nil {
		requests = []*model.ClubJoinRequest{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": requests})
}

// POST /api/v1/clubs/{id}/join-requests/{requestId}/decide
func (h *ClubHandler) DecideJoinRequest(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	clubID := chi.URLParam(r, "id")
	requestID := chi.URLParam(r, "requestId")

	var body struct {
		Decision string `json:"decision"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	err := h.svc.DecideJoinRequest(r.Context(), clubID, requestID, userID, body.Decision)
	if err != nil {
		if errors.Is(err, service.ErrClubNotAdmin) {
			writeError(w, http.StatusForbidden, "admin access required")
			return
		}
		if errors.Is(err, service.ErrClubNotFound) {
			writeError(w, http.StatusNotFound, "request not found")
			return
		}
		if errors.Is(err, service.ErrClubInvalidDecide) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to decide request")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"decided": true})
}

// DELETE /api/v1/clubs/{id}/members/{userId}
func (h *ClubHandler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	requesterID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	clubID := chi.URLParam(r, "id")
	targetID := chi.URLParam(r, "userId")

	if err := h.svc.RemoveMember(r.Context(), clubID, requesterID, targetID); err != nil {
		if errors.Is(err, service.ErrClubNotAdmin) {
			writeError(w, http.StatusForbidden, "admin access required")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to remove member")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/clubs/{id}/image
func (h *ClubHandler) UploadImage(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	clubID := chi.URLParam(r, "id")

	isAdmin, err := h.svc.IsAdmin(r.Context(), clubID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to check permissions")
		return
	}
	if !isAdmin {
		writeError(w, http.StatusForbidden, "admin access required")
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

	img, err := h.images.Create(r.Context(), userID, data, contentType)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to store image")
		return
	}

	imageURL := fmt.Sprintf("/api/v1/images/%s", img.ID)
	if err := h.svc.UpdateImageURL(r.Context(), clubID, userID, imageURL); err != nil {
		if errors.Is(err, service.ErrClubNotAdmin) {
			writeError(w, http.StatusForbidden, "admin access required")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to update club image")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"image_url": imageURL})
}

// GET /api/v1/clubs/{id}/leagues
func (h *ClubHandler) ListLeagues(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	clubID := chi.URLParam(r, "id")

	isMember, err := h.svc.IsMember(r.Context(), clubID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to check membership")
		return
	}
	if !isMember {
		writeError(w, http.StatusForbidden, "club membership required")
		return
	}

	leagues, err := h.leagues.ListByClub(r.Context(), clubID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list club leagues")
		return
	}
	if leagues == nil {
		leagues = []*model.League{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": leagues})
}

// POST /api/v1/clubs/{id}/leagues
func (h *ClubHandler) CreateLeague(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	clubID := chi.URLParam(r, "id")

	var input model.CreateLeagueInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	input.ClubID = &clubID

	league, err := h.leagues.Create(r.Context(), userID, &input)
	if err != nil {
		if errors.Is(err, service.ErrNotAdmin) {
			writeError(w, http.StatusForbidden, "must be a club admin to create a league")
			return
		}
		if errors.Is(err, service.ErrInvalidLeague) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to create league")
		return
	}

	writeJSON(w, http.StatusCreated, league)
}
