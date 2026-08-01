package handler

import (
	"errors"
	"fmt"
	"net/http"
	"regexp"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

type LeagueHandler struct {
	svc    *service.LeagueService
	images *repository.ImageRepository
}

var uuidPattern = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

func NewLeague(svc *service.LeagueService, images *repository.ImageRepository) *LeagueHandler {
	return &LeagueHandler{svc: svc, images: images}
}

func isUUID(value string) bool {
	return uuidPattern.MatchString(value)
}

func writeInvalidUUIDError(w http.ResponseWriter, label string) {
	writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid %s", label))
}

// POST /api/v1/leagues
func (h *LeagueHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var input model.CreateLeagueInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	league, err := h.svc.Create(r.Context(), userID, &input)
	if err != nil {
		if errors.Is(err, service.ErrInvalidLeague) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to create league")
		return
	}

	writeJSON(w, http.StatusCreated, league)
}

// GET /api/v1/users/me/leagues
func (h *LeagueHandler) ListMyLeagues(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	leagues, err := h.svc.ListMyLeagues(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list my leagues")
		return
	}

	if leagues == nil {
		leagues = []*model.MyLeagueSummary{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": leagues})
}

// GET /api/v1/leagues
// Optional ?code=XYZ resolves a single league by join_code (case-insensitive),
// including private leagues, so codes work as discovery handles.
func (h *LeagueHandler) List(w http.ResponseWriter, r *http.Request) {
	if code := r.URL.Query().Get("code"); code != "" {
		league, err := h.svc.LookupByJoinCode(r.Context(), code)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to look up league")
			return
		}
		items := []*model.League{}
		if league != nil {
			items = append(items, league)
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": items})
		return
	}

	leagues, err := h.svc.ListPublic(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list leagues")
		return
	}

	if leagues == nil {
		leagues = []*model.League{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": leagues})
}

// GET /api/v1/leagues/{id}
func (h *LeagueHandler) Get(w http.ResponseWriter, r *http.Request) {
	leagueID := chi.URLParam(r, "id")
	if !isUUID(leagueID) {
		writeInvalidUUIDError(w, "league id")
		return
	}

	viewerID, _ := middleware.UserIDFromContext(r.Context())
	viewerRole, _ := middleware.UserRoleFromContext(r.Context())

	league, err := h.svc.GetByID(r.Context(), leagueID, viewerID, viewerRole)
	if err != nil {
		if errors.Is(err, service.ErrUnauthenticated) {
			writeError(w, http.StatusUnauthorized, "authentication required")
			return
		}
		if errors.Is(err, service.ErrLeagueNotFound) {
			writeError(w, http.StatusNotFound, "league not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to fetch league")
		return
	}

	writeJSON(w, http.StatusOK, league)
}

// GET /api/v1/leagues/{id}/summary - minimal info for rendering the
// members-only banner on private leagues, parallel to clubs.
func (h *LeagueHandler) Summary(w http.ResponseWriter, r *http.Request) {
	leagueID := chi.URLParam(r, "id")
	if !isUUID(leagueID) {
		writeInvalidUUIDError(w, "league id")
		return
	}
	summary, err := h.svc.SummaryByID(r.Context(), leagueID)
	if err != nil {
		if errors.Is(err, service.ErrLeagueNotFound) {
			writeError(w, http.StatusNotFound, "league not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to get league summary")
		return
	}
	writeJSON(w, http.StatusOK, summary)
}

// POST /api/v1/leagues/{id}/join
func (h *LeagueHandler) Join(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	leagueID := chi.URLParam(r, "id")
	if !isUUID(leagueID) {
		writeInvalidUUIDError(w, "league id")
		return
	}

	var body struct {
		JoinCode string `json:"join_code"`
	}
	// Ignore decode errors — body may be empty for open leagues
	_ = decodeJSON(r, &body)

	joined, pending, err := h.svc.Join(r.Context(), leagueID, userID, body.JoinCode)
	if err != nil {
		if errors.Is(err, service.ErrLeagueNotFound) {
			writeError(w, http.StatusNotFound, "league not found")
			return
		}
		if errors.Is(err, service.ErrAlreadyMember) {
			writeError(w, http.StatusConflict, "already a member of this league")
			return
		}
		if errors.Is(err, service.ErrInvalidJoinCode) {
			writeError(w, http.StatusForbidden, "invalid or missing join code")
			return
		}
		if errors.Is(err, service.ErrPendingRequest) {
			writeError(w, http.StatusConflict, "join request already pending")
			return
		}
		if errors.Is(err, service.ErrNotClubMember) {
			writeError(w, http.StatusForbidden, "club membership required to join this league")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to join league")
		return
	}

	if pending {
		writeJSON(w, http.StatusAccepted, map[string]any{"pending": true})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"joined": joined})
}

// GET /api/v1/leagues/{id}/standings
func (h *LeagueHandler) Standings(w http.ResponseWriter, r *http.Request) {
	leagueID := chi.URLParam(r, "id")
	if !isUUID(leagueID) {
		writeInvalidUUIDError(w, "league id")
		return
	}

	// Gate: verify access (club membership / private league check)
	viewerID, _ := middleware.UserIDFromContext(r.Context())
	viewerRole, _ := middleware.UserRoleFromContext(r.Context())
	if _, err := h.svc.GetByID(r.Context(), leagueID, viewerID, viewerRole); err != nil {
		if errors.Is(err, service.ErrUnauthenticated) {
			writeError(w, http.StatusUnauthorized, "authentication required")
			return
		}
		if errors.Is(err, service.ErrLeagueNotFound) {
			writeError(w, http.StatusNotFound, "league not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to verify league access")
		return
	}

	standings, err := h.svc.Standings(r.Context(), leagueID)
	if err != nil {
		if errors.Is(err, service.ErrLeagueNotFound) {
			writeError(w, http.StatusNotFound, "league not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to get standings")
		return
	}

	if standings == nil {
		standings = []*model.LeagueStanding{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": standings})
}

// ---------------------------------------------------------------------------
// League config
// ---------------------------------------------------------------------------

// GET /api/v1/leagues/{id}/config
func (h *LeagueHandler) GetConfig(w http.ResponseWriter, r *http.Request) {
	leagueID := chi.URLParam(r, "id")
	if !isUUID(leagueID) {
		writeInvalidUUIDError(w, "league id")
		return
	}

	// Gate: verify access (club membership / private league check)
	viewerID, _ := middleware.UserIDFromContext(r.Context())
	viewerRole, _ := middleware.UserRoleFromContext(r.Context())
	if _, err := h.svc.GetByID(r.Context(), leagueID, viewerID, viewerRole); err != nil {
		if errors.Is(err, service.ErrUnauthenticated) {
			writeError(w, http.StatusUnauthorized, "authentication required")
			return
		}
		if errors.Is(err, service.ErrLeagueNotFound) {
			writeError(w, http.StatusNotFound, "league not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to verify league access")
		return
	}

	cfg, err := h.svc.GetConfig(r.Context(), leagueID)
	if err != nil {
		if errors.Is(err, service.ErrLeagueNotFound) {
			writeError(w, http.StatusNotFound, "league not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to get config")
		return
	}

	writeJSON(w, http.StatusOK, cfg)
}

// PATCH /api/v1/leagues/{id}/config
func (h *LeagueHandler) UpdateConfig(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	leagueID := chi.URLParam(r, "id")
	if !isUUID(leagueID) {
		writeInvalidUUIDError(w, "league id")
		return
	}

	var input model.UpdateLeagueConfigInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	cfg, err := h.svc.UpdateConfig(r.Context(), leagueID, userID, &input)
	if err != nil {
		if errors.Is(err, service.ErrNotAdmin) {
			writeError(w, http.StatusForbidden, "not a league admin")
			return
		}
		if errors.Is(err, service.ErrInvalidConfig) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if errors.Is(err, service.ErrLeagueNotFound) {
			writeError(w, http.StatusNotFound, "league not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to update config")
		return
	}

	writeJSON(w, http.StatusOK, cfg)
}

// ---------------------------------------------------------------------------
// Seasons & rounds
// ---------------------------------------------------------------------------

// POST /api/v1/leagues/{id}/seasons
func (h *LeagueHandler) CreateSeason(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	leagueID := chi.URLParam(r, "id")
	if !isUUID(leagueID) {
		writeInvalidUUIDError(w, "league id")
		return
	}

	var input model.CreateSeasonInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	season, err := h.svc.CreateSeason(r.Context(), leagueID, userID, &input)
	if err != nil {
		if errors.Is(err, service.ErrNotAdmin) {
			writeError(w, http.StatusForbidden, "not a league admin")
			return
		}
		if errors.Is(err, service.ErrInvalidSeason) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to create season")
		return
	}

	writeJSON(w, http.StatusCreated, season)
}

// GET /api/v1/leagues/{id}/seasons
func (h *LeagueHandler) ListSeasons(w http.ResponseWriter, r *http.Request) {
	leagueID := chi.URLParam(r, "id")
	if !isUUID(leagueID) {
		writeInvalidUUIDError(w, "league id")
		return
	}

	seasons, err := h.svc.ListSeasons(r.Context(), leagueID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list seasons")
		return
	}

	if seasons == nil {
		seasons = []*model.Season{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": seasons})
}

// POST /api/v1/leagues/{id}/seasons/{seasonId}/rounds
func (h *LeagueHandler) CreateRound(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	leagueID := chi.URLParam(r, "id")
	seasonID := chi.URLParam(r, "seasonId")
	if !isUUID(leagueID) {
		writeInvalidUUIDError(w, "league id")
		return
	}
	if !isUUID(seasonID) {
		writeInvalidUUIDError(w, "season id")
		return
	}

	var input model.CreateRoundInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	round, err := h.svc.CreateRound(r.Context(), leagueID, userID, seasonID, &input)
	if err != nil {
		if errors.Is(err, service.ErrNotAdmin) {
			writeError(w, http.StatusForbidden, "not a league admin")
			return
		}
		if errors.Is(err, service.ErrInvalidRound) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to create round")
		return
	}

	writeJSON(w, http.StatusCreated, round)
}

// GET /api/v1/leagues/{id}/seasons/{seasonId}/rounds
func (h *LeagueHandler) ListRounds(w http.ResponseWriter, r *http.Request) {
	seasonID := chi.URLParam(r, "seasonId")
	if !isUUID(seasonID) {
		writeInvalidUUIDError(w, "season id")
		return
	}

	rounds, err := h.svc.ListRounds(r.Context(), seasonID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list rounds")
		return
	}

	if rounds == nil {
		rounds = []*model.Round{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": rounds})
}

// POST /api/v1/leagues/{id}/ensure-round
func (h *LeagueHandler) EnsureDefaultRound(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	leagueID := chi.URLParam(r, "id")
	if !isUUID(leagueID) {
		writeInvalidUUIDError(w, "league id")
		return
	}

	roundID, err := h.svc.EnsureDefaultRound(r.Context(), leagueID, userID)
	if err != nil {
		if errors.Is(err, service.ErrNotMember) {
			writeError(w, http.StatusForbidden, "league membership required")
			return
		}
		if errors.Is(err, service.ErrLeagueNotFound) {
			writeError(w, http.StatusNotFound, "league not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to ensure default round")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"round_id": roundID})
}

// GET /api/v1/leagues/{id}/scores
func (h *LeagueHandler) ListScores(w http.ResponseWriter, r *http.Request) {
	leagueID := chi.URLParam(r, "id")
	if !isUUID(leagueID) {
		writeInvalidUUIDError(w, "league id")
		return
	}

	// Gate: verify access (club membership / private league check)
	viewerID, _ := middleware.UserIDFromContext(r.Context())
	viewerRole, _ := middleware.UserRoleFromContext(r.Context())
	if _, err := h.svc.GetByID(r.Context(), leagueID, viewerID, viewerRole); err != nil {
		if errors.Is(err, service.ErrUnauthenticated) {
			writeError(w, http.StatusUnauthorized, "authentication required")
			return
		}
		if errors.Is(err, service.ErrLeagueNotFound) {
			writeError(w, http.StatusNotFound, "league not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to verify league access")
		return
	}

	limit, offset := parsePagination(r, 20, 100)
	verification := r.URL.Query().Get("verification")

	scores, err := h.svc.ListScores(r.Context(), leagueID, limit, offset, verification)
	if err != nil {
		if errors.Is(err, service.ErrLeagueNotFound) {
			writeError(w, http.StatusNotFound, "league not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to list league scores")
		return
	}

	if scores == nil {
		scores = []*model.LeagueScore{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": scores})
}

// GET /api/v1/leagues/{id}/score-counts
func (h *LeagueHandler) ScoreCounts(w http.ResponseWriter, r *http.Request) {
	leagueID := chi.URLParam(r, "id")
	if !isUUID(leagueID) {
		writeInvalidUUIDError(w, "league id")
		return
	}

	// Gate: verify access (club membership / private league check)
	viewerID, _ := middleware.UserIDFromContext(r.Context())
	viewerRole, _ := middleware.UserRoleFromContext(r.Context())
	if _, err := h.svc.GetByID(r.Context(), leagueID, viewerID, viewerRole); err != nil {
		if errors.Is(err, service.ErrUnauthenticated) {
			writeError(w, http.StatusUnauthorized, "authentication required")
			return
		}
		if errors.Is(err, service.ErrLeagueNotFound) {
			writeError(w, http.StatusNotFound, "league not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to verify league access")
		return
	}

	counts, err := h.svc.CountScores(r.Context(), leagueID)
	if err != nil {
		if errors.Is(err, service.ErrLeagueNotFound) {
			writeError(w, http.StatusNotFound, "league not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to count league scores")
		return
	}

	writeJSON(w, http.StatusOK, counts)
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

// GET /api/v1/leagues/{id}/members
func (h *LeagueHandler) ListMembers(w http.ResponseWriter, r *http.Request) {
	leagueID := chi.URLParam(r, "id")
	if !isUUID(leagueID) {
		writeInvalidUUIDError(w, "league id")
		return
	}

	// Gate: verify access (club membership / private league check)
	viewerID, _ := middleware.UserIDFromContext(r.Context())
	viewerRole, _ := middleware.UserRoleFromContext(r.Context())
	if _, err := h.svc.GetByID(r.Context(), leagueID, viewerID, viewerRole); err != nil {
		if errors.Is(err, service.ErrUnauthenticated) {
			writeError(w, http.StatusUnauthorized, "authentication required")
			return
		}
		if errors.Is(err, service.ErrLeagueNotFound) {
			writeError(w, http.StatusNotFound, "league not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to verify league access")
		return
	}

	members, err := h.svc.ListMembers(r.Context(), leagueID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list members")
		return
	}

	if members == nil {
		members = []*model.LeagueMember{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": members})
}

// DELETE /api/v1/leagues/{id}/members/me
func (h *LeagueHandler) Leave(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	leagueID := chi.URLParam(r, "id")
	if !isUUID(leagueID) {
		writeInvalidUUIDError(w, "league id")
		return
	}

	if err := h.svc.LeaveLeague(r.Context(), leagueID, userID); err != nil {
		if errors.Is(err, service.ErrNotMember) {
			writeError(w, http.StatusNotFound, "not a member of this league")
			return
		}
		if errors.Is(err, service.ErrLeagueLastAdmin) {
			writeError(w, http.StatusConflict, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to leave league")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// DELETE /api/v1/leagues/{id}/members/{userId}
func (h *LeagueHandler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	leagueID := chi.URLParam(r, "id")
	memberID := chi.URLParam(r, "userId")
	if !isUUID(leagueID) {
		writeInvalidUUIDError(w, "league id")
		return
	}
	if !isUUID(memberID) {
		writeInvalidUUIDError(w, "member id")
		return
	}

	if err := h.svc.RemoveMember(r.Context(), leagueID, userID, memberID); err != nil {
		if errors.Is(err, service.ErrNotAdmin) {
			writeError(w, http.StatusForbidden, err.Error())
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusNotFound, "member not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to remove member")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// PATCH /api/v1/leagues/{id}/members/{userId}
func (h *LeagueHandler) UpdateMember(w http.ResponseWriter, r *http.Request) {
	requesterID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	leagueID := chi.URLParam(r, "id")
	targetID := chi.URLParam(r, "userId")
	if !isUUID(leagueID) {
		writeInvalidUUIDError(w, "league id")
		return
	}
	if !isUUID(targetID) {
		writeInvalidUUIDError(w, "member id")
		return
	}

	var input model.UpdateLeagueMemberInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if input.IsAdmin == nil {
		writeError(w, http.StatusBadRequest, "is_admin field is required")
		return
	}

	if err := h.svc.UpdateMemberRole(r.Context(), leagueID, requesterID, targetID, *input.IsAdmin); err != nil {
		if errors.Is(err, service.ErrNotAdmin) {
			writeError(w, http.StatusForbidden, "not a league admin")
			return
		}
		if errors.Is(err, service.ErrLeagueOnlyAdmin) {
			writeError(w, http.StatusConflict, err.Error())
			return
		}
		if errors.Is(err, service.ErrNotMember) {
			writeError(w, http.StatusNotFound, "member not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to update member")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"updated": true})
}

// ---------------------------------------------------------------------------
// Join requests
// ---------------------------------------------------------------------------

// GET /api/v1/leagues/{id}/join-requests
func (h *LeagueHandler) ListJoinRequests(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	leagueID := chi.URLParam(r, "id")
	status := r.URL.Query().Get("status")
	if !isUUID(leagueID) {
		writeInvalidUUIDError(w, "league id")
		return
	}

	requests, err := h.svc.ListJoinRequests(r.Context(), leagueID, userID, status)
	if err != nil {
		if errors.Is(err, service.ErrNotAdmin) {
			writeError(w, http.StatusForbidden, "not a league admin")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to list join requests")
		return
	}

	if requests == nil {
		requests = []*model.JoinRequest{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": requests})
}

// POST /api/v1/leagues/{id}/join-requests/{requestId}/decide
func (h *LeagueHandler) DecideJoinRequest(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	leagueID := chi.URLParam(r, "id")
	requestID := chi.URLParam(r, "requestId")
	if !isUUID(leagueID) {
		writeInvalidUUIDError(w, "league id")
		return
	}
	if !isUUID(requestID) {
		writeInvalidUUIDError(w, "join request id")
		return
	}

	var body struct {
		Decision string `json:"decision"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	err := h.svc.DecideJoinRequest(r.Context(), leagueID, requestID, userID, body.Decision)
	if err != nil {
		if errors.Is(err, service.ErrNotAdmin) {
			writeError(w, http.StatusForbidden, "not a league admin")
			return
		}
		if errors.Is(err, service.ErrLeagueNotFound) {
			writeError(w, http.StatusNotFound, "request not found")
			return
		}
		if errors.Is(err, service.ErrInvalidLeague) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to decide request")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"decided": true})
}

// PATCH /api/v1/leagues/{id}
func (h *LeagueHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	leagueID := chi.URLParam(r, "id")
	if !isUUID(leagueID) {
		writeInvalidUUIDError(w, "league id")
		return
	}

	var input model.UpdateLeagueBasicsInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	league, err := h.svc.UpdateLeague(r.Context(), leagueID, userID, &input)
	if err != nil {
		if errors.Is(err, service.ErrNotAdmin) {
			writeError(w, http.StatusForbidden, "not a league admin")
			return
		}
		if errors.Is(err, service.ErrInvalidLeague) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if errors.Is(err, service.ErrLeagueNotFound) {
			writeError(w, http.StatusNotFound, "league not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to update league")
		return
	}

	writeJSON(w, http.StatusOK, league)
}

// POST /api/v1/leagues/{id}/join-code
func (h *LeagueHandler) RegenerateJoinCode(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	leagueID := chi.URLParam(r, "id")
	if !isUUID(leagueID) {
		writeInvalidUUIDError(w, "league id")
		return
	}

	code, err := h.svc.RegenerateJoinCode(r.Context(), leagueID, userID)
	if err != nil {
		if errors.Is(err, service.ErrNotAdmin) {
			writeError(w, http.StatusForbidden, "not a league admin")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to regenerate join code")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"join_code": code})
}

// ---------------------------------------------------------------------------
// League image
// ---------------------------------------------------------------------------

// POST /api/v1/leagues/{id}/image
func (h *LeagueHandler) UploadImage(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	leagueID := chi.URLParam(r, "id")
	if !isUUID(leagueID) {
		writeInvalidUUIDError(w, "league id")
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
	err = h.svc.UpdateImageURL(r.Context(), leagueID, userID, imageURL)
	if err != nil {
		if errors.Is(err, service.ErrNotAdmin) {
			writeError(w, http.StatusForbidden, "not a league admin")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to update league image")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"image_url": imageURL})
}

// ---------------------------------------------------------------------------
// Score verification
// ---------------------------------------------------------------------------

// POST /api/v1/score-cards/{id}/confirmations
func (h *LeagueHandler) ConfirmScore(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	scoreCardID := chi.URLParam(r, "id")
	if !isUUID(scoreCardID) {
		writeInvalidUUIDError(w, "score card id")
		return
	}

	err := h.svc.ConfirmScore(r.Context(), scoreCardID, userID)
	if err != nil {
		if errors.Is(err, service.ErrNotMember) {
			writeError(w, http.StatusForbidden, "not a league member")
			return
		}
		if errors.Is(err, service.ErrCannotConfirmOwn) {
			writeError(w, http.StatusForbidden, "cannot confirm your own score")
			return
		}
		if errors.Is(err, service.ErrAlreadyConfirmed) {
			writeError(w, http.StatusConflict, "already confirmed this score")
			return
		}
		if errors.Is(err, service.ErrLeagueNotFound) {
			writeError(w, http.StatusNotFound, "score card not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to confirm score")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"confirmed": true})
}

// GET /api/v1/score-cards/{id}/audit-trail
func (h *LeagueHandler) GetScoreAuditTrail(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	scoreCardID := chi.URLParam(r, "id")
	if !isUUID(scoreCardID) {
		writeInvalidUUIDError(w, "score card id")
		return
	}

	confs, actions, err := h.svc.GetScoreAuditTrail(r.Context(), scoreCardID, userID)
	if err != nil {
		if errors.Is(err, service.ErrNotMember) {
			writeError(w, http.StatusForbidden, "not a league member")
			return
		}
		if errors.Is(err, service.ErrLeagueNotFound) {
			writeError(w, http.StatusNotFound, "score card not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to get audit trail")
		return
	}

	if confs == nil {
		confs = []*model.ScoreConfirmation{}
	}
	if actions == nil {
		actions = []*model.ScoreCardAction{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"confirmations": confs, "actions": actions})
}

// POST /api/v1/score-cards/{id}/amend
func (h *LeagueHandler) AmendScore(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	scoreCardID := chi.URLParam(r, "id")
	if !isUUID(scoreCardID) {
		writeInvalidUUIDError(w, "score card id")
		return
	}

	var input model.AmendScoreInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	err := h.svc.AmendScore(r.Context(), scoreCardID, userID, &input)
	if err != nil {
		if errors.Is(err, service.ErrNotAdmin) {
			writeError(w, http.StatusForbidden, "not a league admin")
			return
		}
		if errors.Is(err, service.ErrInvalidAmend) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to amend score")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"amended": true})
}

// POST /api/v1/score-cards/{id}/reject
func (h *LeagueHandler) RejectScore(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	scoreCardID := chi.URLParam(r, "id")
	if !isUUID(scoreCardID) {
		writeInvalidUUIDError(w, "score card id")
		return
	}

	var input model.RejectScoreInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	err := h.svc.RejectScore(r.Context(), scoreCardID, userID, &input)
	if err != nil {
		if errors.Is(err, service.ErrNotAdmin) {
			writeError(w, http.StatusForbidden, "not a league admin")
			return
		}
		if errors.Is(err, service.ErrReasonRequired) {
			writeError(w, http.StatusUnprocessableEntity, "reason is required for rejection")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to reject score")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"rejected": true})
}

// GET /api/v1/score-cards/{id}/league
func (h *LeagueHandler) GetLeagueForScoreCard(w http.ResponseWriter, r *http.Request) {
	scoreCardID := chi.URLParam(r, "id")
	if !isUUID(scoreCardID) {
		writeInvalidUUIDError(w, "score card id")
		return
	}

	league, err := h.svc.GetLeagueForScoreCard(r.Context(), scoreCardID)
	if err != nil {
		if errors.Is(err, service.ErrLeagueNotFound) {
			writeError(w, http.StatusNotFound, "score card is not linked to a league")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to resolve league")
		return
	}

	writeJSON(w, http.StatusOK, league)
}
