package handler

import (
	"net/http"

	"github.com/jnnngs/sub-12/backend/internal/api/middleware"
	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

// SitemapHandler serves the public sitemap.xml endpoint.
type SitemapHandler struct {
	svc *service.SitemapService
}

func NewSitemap(svc *service.SitemapService) *SitemapHandler {
	return &SitemapHandler{svc: svc}
}

// ServeXML responds with the dynamically generated sitemap.xml.
// GET /sitemap.xml
func (h *SitemapHandler) ServeXML(w http.ResponseWriter, r *http.Request) {
	data, err := h.svc.GenerateXML(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate sitemap")
		return
	}
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.WriteHeader(http.StatusOK)
	w.Write(data)
}

// AdminSitemapHandler provides admin endpoints for sitemap management.
type AdminSitemapHandler struct {
	svc *service.SitemapService
}

func NewAdminSitemap(svc *service.SitemapService) *AdminSitemapHandler {
	return &AdminSitemapHandler{svc: svc}
}

// Stats returns counts of public content that appears in the sitemap.
// GET /api/v1/admin/sitemap/stats
func (h *AdminSitemapHandler) Stats(w http.ResponseWriter, r *http.Request) {
	stats, err := h.svc.Stats(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch sitemap stats")
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

// Ping submits the sitemap URL to the requested search engines.
// POST /api/v1/admin/sitemap/ping
func (h *AdminSitemapHandler) Ping(w http.ResponseWriter, r *http.Request) {
	adminID, _ := middleware.UserIDFromContext(r.Context())

	var input model.SitemapPingRequest
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(input.Engines) == 0 {
		writeError(w, http.StatusBadRequest, "engines list must not be empty")
		return
	}

	results, err := h.svc.PingEngines(
		r.Context(),
		adminID,
		input.Engines,
		input.IndexNowKey,
		input.IndexNowKeyLocation,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "sitemap ping failed")
		return
	}
	writeJSON(w, http.StatusOK, results)
}

// ListSubmissions returns the paginated audit log of sitemap pings.
// GET /api/v1/admin/sitemap/submissions
func (h *AdminSitemapHandler) ListSubmissions(w http.ResponseWriter, r *http.Request) {
	limit, offset := parsePagination(r, 20, 100)

	subs, total, err := h.svc.ListSubmissions(r.Context(), limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list submissions")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"submissions": subs,
		"total":       total,
	})
}
