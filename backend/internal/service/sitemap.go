package service

import (
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/rs/zerolog"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

// SitemapService generates a dynamic sitemap.xml and pings search engines.
type SitemapService struct {
	repo    *repository.SitemapRepository
	siteURL string
	log     zerolog.Logger
	client  *http.Client
}

func NewSitemapService(repo *repository.SitemapRepository, siteURL string, log zerolog.Logger) *SitemapService {
	return &SitemapService{
		repo:    repo,
		siteURL: strings.TrimRight(siteURL, "/"),
		log:     log,
		client:  &http.Client{Timeout: 15 * time.Second},
	}
}

// staticPages returns the fixed application pages that should appear in every sitemap.
func (s *SitemapService) staticPages() []model.SitemapURL {
	weekly := "weekly"
	monthly := "monthly"
	p1 := "1.0"
	p08 := "0.8"
	p06 := "0.6"
	p05 := "0.5"

	return []model.SitemapURL{
		{Loc: s.siteURL + "/", ChangeFreq: &weekly, Priority: &p1},
		{Loc: s.siteURL + "/login", ChangeFreq: &monthly, Priority: &p05},
		{Loc: s.siteURL + "/register", ChangeFreq: &monthly, Priority: &p06},
		{Loc: s.siteURL + "/leagues", ChangeFreq: &weekly, Priority: &p08},
		{Loc: s.siteURL + "/clubs", ChangeFreq: &weekly, Priority: &p08},
		{Loc: s.siteURL + "/pellet-tests/leaderboard", ChangeFreq: &weekly, Priority: &p06},
	}
}

// GenerateXML builds the complete sitemap XML for the site.
func (s *SitemapService) GenerateXML(ctx context.Context) ([]byte, error) {
	urlset := model.SitemapURLSet{
		XMLNS: "http://www.sitemaps.org/schemas/sitemap/0.9",
	}

	// Static pages
	urlset.URLs = append(urlset.URLs, s.staticPages()...)

	weekly := "weekly"
	p07 := "0.7"
	p06 := "0.6"

	// Public users
	users, err := s.repo.ListPublicUserIDs(ctx)
	if err != nil {
		return nil, fmt.Errorf("sitemap users: %w", err)
	}
	for _, u := range users {
		urlset.URLs = append(urlset.URLs, model.SitemapURL{
			Loc:        s.siteURL + "/users/" + u.ID,
			LastMod:    &u.UpdatedAt,
			ChangeFreq: &weekly,
			Priority:   &p07,
		})
	}

	// Public leagues
	leagues, err := s.repo.ListPublicLeagueIDs(ctx)
	if err != nil {
		return nil, fmt.Errorf("sitemap leagues: %w", err)
	}
	for _, l := range leagues {
		urlset.URLs = append(urlset.URLs, model.SitemapURL{
			Loc:        s.siteURL + "/leagues/" + l.ID,
			LastMod:    &l.UpdatedAt,
			ChangeFreq: &weekly,
			Priority:   &p07,
		})
	}

	// Public clubs
	clubs, err := s.repo.ListPublicClubIDs(ctx)
	if err != nil {
		return nil, fmt.Errorf("sitemap clubs: %w", err)
	}
	for _, c := range clubs {
		urlset.URLs = append(urlset.URLs, model.SitemapURL{
			Loc:        s.siteURL + "/clubs/" + c.ID,
			LastMod:    &c.UpdatedAt,
			ChangeFreq: &weekly,
			Priority:   &p06,
		})
	}

	out, err := xml.MarshalIndent(urlset, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("marshal sitemap xml: %w", err)
	}
	return append([]byte(xml.Header), out...), nil
}

// Stats returns counts of content that will appear in the sitemap.
func (s *SitemapService) Stats(ctx context.Context) (*model.SitemapStats, error) {
	staticCount := len(s.staticPages())

	users, err := s.repo.CountPublicUsers(ctx)
	if err != nil {
		return nil, err
	}
	leagues, err := s.repo.CountPublicLeagues(ctx)
	if err != nil {
		return nil, err
	}
	clubs, err := s.repo.CountPublicClubs(ctx)
	if err != nil {
		return nil, err
	}

	return &model.SitemapStats{
		StaticPages:   staticCount,
		PublicUsers:   users,
		PublicLeagues: leagues,
		PublicClubs:   clubs,
		TotalURLs:     staticCount + users + leagues + clubs,
	}, nil
}

// knownEngines maps engine names to their sitemap ping URL templates.
// %s is replaced with the URL-encoded sitemap URL.
var knownEngines = map[string]string{
	"google":   "https://www.google.com/ping?sitemap=%s",
	"bing":     "https://www.bing.com/ping?sitemap=%s",
	"indexnow": "https://api.indexnow.org/indexnow?url=%s&urlList=%s",
}

// PingEngines submits the sitemap URL to the requested search engines and
// records each attempt in the audit table.
func (s *SitemapService) PingEngines(ctx context.Context, adminID string, engines []string) ([]*model.SitemapSubmission, error) {
	sitemapURL := s.siteURL + "/sitemap.xml"

	var results []*model.SitemapSubmission

	for _, engine := range engines {
		engine = strings.ToLower(strings.TrimSpace(engine))

		var pingURL string
		switch engine {
		case "google":
			pingURL = fmt.Sprintf("https://www.google.com/ping?sitemap=%s", sitemapURL)
		case "bing":
			pingURL = fmt.Sprintf("https://www.bing.com/ping?sitemap=%s", sitemapURL)
		case "indexnow":
			pingURL = fmt.Sprintf("https://api.indexnow.org/indexnow?url=%s&urlList=%s", s.siteURL, sitemapURL)
		default:
			s.log.Warn().Str("engine", engine).Msg("unknown sitemap ping engine, skipping")
			continue
		}

		var statusCode *int16
		var respBody, errMsg *string

		resp, err := s.client.Get(pingURL)
		if err != nil {
			msg := err.Error()
			errMsg = &msg
			s.log.Error().Err(err).Str("engine", engine).Msg("sitemap ping failed")
		} else {
			code := int16(resp.StatusCode)
			statusCode = &code
			body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
			resp.Body.Close()
			if len(body) > 0 {
				b := string(body)
				respBody = &b
			}
			s.log.Info().Str("engine", engine).Int("status", resp.StatusCode).Msg("sitemap ping sent")
		}

		sub, insertErr := s.repo.InsertSubmission(ctx, engine, pingURL, adminID, statusCode, respBody, errMsg)
		if insertErr != nil {
			s.log.Error().Err(insertErr).Str("engine", engine).Msg("failed to record sitemap submission")
			continue
		}
		results = append(results, sub)
	}

	return results, nil
}

// ListSubmissions returns paginated audit history.
func (s *SitemapService) ListSubmissions(ctx context.Context, limit, offset int) ([]*model.SitemapSubmission, int, error) {
	return s.repo.ListSubmissions(ctx, limit, offset)
}
