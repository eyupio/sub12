package service

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/rs/zerolog"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

// SitemapService generates a dynamic sitemap.xml and pings search engines.
type SitemapService struct {
	repo                 *repository.SitemapRepository
	siteURL              string
	indexNowKey          string
	indexNowKeyLocation  string
	generatedIndexNowKey string
	log                  zerolog.Logger
	client               *http.Client
}

func NewSitemapService(repo *repository.SitemapRepository, siteURL, indexNowKey, indexNowKeyLocation string, log zerolog.Logger) *SitemapService {
	return &SitemapService{
		repo:                 repo,
		siteURL:              strings.TrimRight(siteURL, "/"),
		indexNowKey:          strings.TrimSpace(indexNowKey),
		indexNowKeyLocation:  strings.TrimSpace(indexNowKeyLocation),
		generatedIndexNowKey: mustGenerateIndexNowKey(),
		log:                  log,
		client:               &http.Client{Timeout: 15 * time.Second},
	}
}

func mustGenerateIndexNowKey() string {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		panic(fmt.Errorf("generate indexnow key: %w", err))
	}
	return hex.EncodeToString(buf)
}

func (s *SitemapService) indexNowKeyInfo() *model.IndexNowKeyInfo {
	key := s.indexNowKey
	source := "configured"
	if key == "" {
		key = s.generatedIndexNowKey
		source = "generated"
	}
	location := s.indexNowKeyLocation
	if location == "" {
		location = fmt.Sprintf("%s/%s.txt", s.siteURL, key)
	}
	return &model.IndexNowKeyInfo{
		Key:         key,
		KeyLocation: location,
		Source:      source,
	}
}

// IndexNowKeyInfo returns key metadata for admin UI usage.
func (s *SitemapService) IndexNowKeyInfo() *model.IndexNowKeyInfo {
	return s.indexNowKeyInfo()
}

// ResolveIndexNowKeyFile returns the key-file content for a root-path key file request.
func (s *SitemapService) ResolveIndexNowKeyFile(requestedKey string) (string, bool) {
	info := s.indexNowKeyInfo()
	if strings.TrimSpace(requestedKey) != info.Key {
		return "", false
	}
	return info.Key, true
}

// shareRef prefers the slug spelling of a share URL and falls back to the
// UUID for rows that predate slug backfill. It mirrors the handler-side
// helper of the same name, so the URL the sitemap advertises is byte-for-byte
// the one ShareMeta emits as rel=canonical on that page.
func shareRef(slug, id string) string {
	if slug != "" {
		return slug
	}
	return id
}

// staticPages returns the fixed application pages that should appear in every
// sitemap.
//
// Every entry here must be a route anonymous visitors can actually reach —
// that is, a child of `rootRoute`/`authRoute` in the frontend route tree, not
// of `appRoute` (whose `beforeLoad: requireAuth` bounces a crawler to /login)
// — and must not be disallowed by frontend/public/robots.txt. Listing a URL
// that fails either test is what makes Search Console report "Blocked by
// robots.txt" or a soft 404 against the sitemap.
func (s *SitemapService) staticPages() []model.SitemapURL {
	weekly := "weekly"
	monthly := "monthly"
	yearly := "yearly"
	p1 := "1.0"
	p08 := "0.8"
	p06 := "0.6"
	p05 := "0.5"
	p03 := "0.3"

	return []model.SitemapURL{
		{Loc: s.siteURL + "/", ChangeFreq: &weekly, Priority: &p1},
		{Loc: s.siteURL + "/pellet-leaderboard", ChangeFreq: &weekly, Priority: &p08},
		{Loc: s.siteURL + "/register", ChangeFreq: &monthly, Priority: &p06},
		{Loc: s.siteURL + "/login", ChangeFreq: &monthly, Priority: &p05},
		{Loc: s.siteURL + "/privacy", ChangeFreq: &yearly, Priority: &p03},
		{Loc: s.siteURL + "/terms", ChangeFreq: &yearly, Priority: &p03},
		{Loc: s.siteURL + "/cookies", ChangeFreq: &yearly, Priority: &p03},
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

	// Entity URLs point at the public /share/* pages, never at the in-app
	// /users/{id}, /leagues/{id} or /clubs/{id} routes. Those in-app routes
	// sit behind requireAuth and /users/ is disallowed in robots.txt, so
	// listing them produced exactly the "Blocked by robots.txt" and
	// soft-404 reports Search Console raised against this sitemap. The
	// /share/* pages are the ones the backend renders with per-entity
	// metadata and a self-referencing rel=canonical.

	// Public users
	users, err := s.repo.ListPublicUserIDs(ctx)
	if err != nil {
		return nil, fmt.Errorf("sitemap users: %w", err)
	}
	for _, u := range users {
		urlset.URLs = append(urlset.URLs, model.SitemapURL{
			Loc:        s.siteURL + "/share/users/" + shareRef(u.Slug, u.ID),
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
			Loc:        s.siteURL + "/share/leagues/" + shareRef(l.Slug, l.ID),
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
			Loc:        s.siteURL + "/share/clubs/" + shareRef(c.Slug, c.ID),
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

// PingEngines submits the sitemap URL to the requested search engines and
// records each attempt in the audit table.
func (s *SitemapService) PingEngines(ctx context.Context, adminID string, engines []string) ([]*model.SitemapSubmission, error) {
	sitemapURL := s.siteURL + "/sitemap.xml"
	indexNowInfo := s.indexNowKeyInfo()

	var results []*model.SitemapSubmission

	for _, engine := range engines {
		engine = strings.ToLower(strings.TrimSpace(engine))

		var (
			pingURL string
			req     *http.Request
		)
		switch engine {
		case "google":
			msg := "google no longer supports sitemap ping endpoint; submit sitemap in Search Console"
			s.log.Warn().Str("engine", engine).Msg(msg)
			sub, insertErr := s.repo.InsertSubmission(ctx, engine, "", adminID, nil, nil, &msg)
			if insertErr != nil {
				s.log.Error().Err(insertErr).Str("engine", engine).Msg("failed to record sitemap submission")
				continue
			}
			results = append(results, sub)
			continue
		case "bing":
			msg := "bing sitemap ping endpoint is deprecated; use IndexNow instead"
			s.log.Warn().Str("engine", engine).Msg(msg)
			sub, insertErr := s.repo.InsertSubmission(ctx, engine, "", adminID, nil, nil, &msg)
			if insertErr != nil {
				s.log.Error().Err(insertErr).Str("engine", engine).Msg("failed to record sitemap submission")
				continue
			}
			results = append(results, sub)
			continue
		case "indexnow":
			body := map[string]any{
				"host":        mustHost(s.siteURL),
				"key":         indexNowInfo.Key,
				"keyLocation": indexNowInfo.KeyLocation,
				"urlList":     []string{sitemapURL},
			}
			raw, err := json.Marshal(body)
			if err != nil {
				msg := fmt.Sprintf("failed to build indexnow request: %v", err)
				sub, insertErr := s.repo.InsertSubmission(ctx, engine, "", adminID, nil, nil, &msg)
				if insertErr != nil {
					s.log.Error().Err(insertErr).Str("engine", engine).Msg("failed to record sitemap submission")
					continue
				}
				results = append(results, sub)
				continue
			}
			pingURL = "https://api.indexnow.org/indexnow"
			req, err = http.NewRequestWithContext(ctx, http.MethodPost, pingURL, bytes.NewReader(raw))
			if err != nil {
				msg := fmt.Sprintf("failed to build indexnow request: %v", err)
				sub, insertErr := s.repo.InsertSubmission(ctx, engine, pingURL, adminID, nil, nil, &msg)
				if insertErr != nil {
					s.log.Error().Err(insertErr).Str("engine", engine).Msg("failed to record sitemap submission")
					continue
				}
				results = append(results, sub)
				continue
			}
			req.Header.Set("Content-Type", "application/json; charset=utf-8")
		default:
			s.log.Warn().Str("engine", engine).Msg("unknown sitemap ping engine, skipping")
			continue
		}

		var statusCode *int16
		var respBody, errMsg *string

		if req == nil {
			var err error
			req, err = http.NewRequestWithContext(ctx, http.MethodGet, pingURL, nil)
			if err != nil {
				msg := err.Error()
				errMsg = &msg
				sub, insertErr := s.repo.InsertSubmission(ctx, engine, pingURL, adminID, statusCode, nil, errMsg)
				if insertErr == nil {
					results = append(results, sub)
				}
				continue
			}
		}

		resp, err := s.client.Do(req)
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

func mustHost(raw string) string {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return raw
	}
	return u.Host
}

// ListSubmissions returns paginated audit history.
func (s *SitemapService) ListSubmissions(ctx context.Context, limit, offset int) ([]*model.SitemapSubmission, int, error) {
	return s.repo.ListSubmissions(ctx, limit, offset)
}
