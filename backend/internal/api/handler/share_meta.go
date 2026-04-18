package handler

import (
	"context"
	_ "embed"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/rs/zerolog"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

// ShareMeta serves the SPA shell with entity-specific Open Graph / Twitter
// card tags injected into <head>. Paths that match a public, owner-allowed
// entity get rich previews; all other paths receive the stock site-wide tags.
//
// The handler never sniffs user-agents. The same response is returned to
// humans and crawlers — humans keep the working SPA (OG tags are invisible),
// crawlers parse the tags and render a preview card.
type ShareMeta struct {
	scoreCards *service.ScoreCardService
	pelletTest *service.PelletTestService
	leagues    *service.LeagueService
	clubs      *service.ClubService
	users      *service.UserService
	siteURL    string
	siteName   string

	frontendOrigin string
	log            zerolog.Logger

	once sync.Once
	tmpl []byte // cached SPA index.html with OG placeholders
}

// NewShareMeta constructs the share-meta handler. siteURL is the public
// canonical origin (used to build absolute og:url / og:image) and defaults
// to the request scheme+host when empty. frontendOrigin is the internal
// URL the backend can fetch index.html from (e.g. http://frontend:8080).
// When frontendOrigin is empty, a minimal embedded template is served —
// fine for crawlers, though humans won't get the full SPA boot.
func NewShareMeta(
	scoreCards *service.ScoreCardService,
	pelletTest *service.PelletTestService,
	leagues *service.LeagueService,
	clubs *service.ClubService,
	users *service.UserService,
	siteURL, frontendOrigin string,
	log zerolog.Logger,
) *ShareMeta {
	return &ShareMeta{
		scoreCards:     scoreCards,
		pelletTest:     pelletTest,
		leagues:        leagues,
		clubs:          clubs,
		users:          users,
		siteURL:        strings.TrimRight(siteURL, "/"),
		siteName:       "SUB12",
		frontendOrigin: strings.TrimRight(frontendOrigin, "/"),
		log:            log,
	}
}

// openGraph is the data substituted into the HTML shell.
type openGraph struct {
	Title       string
	Description string
	Image       string // absolute URL
	URL         string // absolute URL of the share page
	Type        string // "article", "profile", "website"
}

//go:embed share_meta_fallback.html
var fallbackTemplate string

// ScoreCard returns a handler for /score-cards/{id}.
func (s *ShareMeta) ScoreCard() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		og := s.defaultOG(r)
		id := chi.URLParam(r, "id")
		if id != "" {
			card, err := s.scoreCards.GetForViewer(r.Context(), id, "")
			if err == nil {
				og.Title = fmt.Sprintf("%d points on sub-12", card.TotalScore)
				if card.XCount > 0 {
					og.Title = fmt.Sprintf("%d points (%dX) on sub-12", card.TotalScore, card.XCount)
				}
				og.Description = scoreCardDescription(card)
				if card.CardImageURL != nil && *card.CardImageURL != "" {
					og.Image = s.absolute(*card.CardImageURL)
				}
				og.Type = "article"
			}
		}
		s.writeHTML(w, r, og)
	}
}

// PelletTest returns a handler for /pellet-tests/{id}.
func (s *ShareMeta) PelletTest() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		og := s.defaultOG(r)
		id := chi.URLParam(r, "id")
		if id != "" {
			sess, err := s.pelletTest.GetForViewer(r.Context(), id, "")
			if err == nil {
				og.Title = pelletTestTitle(sess)
				og.Description = pelletTestDescription(sess)
				if len(sess.Images) > 0 && sess.Images[0].ImageURL != "" {
					og.Image = s.absolute(sess.Images[0].ImageURL)
				}
				og.Type = "article"
			}
		}
		s.writeHTML(w, r, og)
	}
}

// League returns a handler for /leagues/{id}.
func (s *ShareMeta) League() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		og := s.defaultOG(r)
		id := chi.URLParam(r, "id")
		if id != "" && s.leagues != nil {
			league, err := s.leagues.GetByID(r.Context(), id, "")
			if err == nil && league != nil {
				og.Title = fmt.Sprintf("%s on sub-12", league.Name)
				if league.Description != nil && *league.Description != "" {
					og.Description = *league.Description
				} else {
					og.Description = fmt.Sprintf("Join the %s league on sub-12.", league.Name)
				}
				if league.ImageURL != nil && *league.ImageURL != "" {
					og.Image = s.absolute(*league.ImageURL)
				}
				og.Type = "article"
			}
		}
		s.writeHTML(w, r, og)
	}
}

// Club returns a handler for /clubs/{id}.
func (s *ShareMeta) Club() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		og := s.defaultOG(r)
		id := chi.URLParam(r, "id")
		if id != "" && s.clubs != nil {
			club, err := s.clubs.GetByID(r.Context(), id, "")
			if err == nil && club != nil {
				og.Title = fmt.Sprintf("%s on sub-12", club.Name)
				if club.Description != nil && *club.Description != "" {
					og.Description = *club.Description
				} else {
					og.Description = fmt.Sprintf("Join the %s club on sub-12.", club.Name)
				}
				if club.ImageURL != nil && *club.ImageURL != "" {
					og.Image = s.absolute(*club.ImageURL)
				}
				og.Type = "article"
			}
		}
		s.writeHTML(w, r, og)
	}
}

// User returns a handler for /users/{id}.
func (s *ShareMeta) User() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		og := s.defaultOG(r)
		id := chi.URLParam(r, "id")
		if id != "" && s.users != nil {
			profile, err := s.users.GetPublicProfile(r.Context(), id)
			if err == nil && profile != nil && profile.ProfileVisibility != "private" {
				og.Title = fmt.Sprintf("%s on sub-12", profile.DisplayName)
				if profile.Bio != nil && *profile.Bio != "" {
					og.Description = *profile.Bio
				} else {
					og.Description = fmt.Sprintf("%s's profile on sub-12.", profile.DisplayName)
				}
				if profile.AvatarURL != nil && *profile.AvatarURL != "" {
					og.Image = s.absolute(*profile.AvatarURL)
				}
				og.Type = "profile"
			}
		}
		s.writeHTML(w, r, og)
	}
}

// defaultOG returns the stock site-wide tags, used when an entity is
// private, missing, or inaccessible to anonymous viewers.
func (s *ShareMeta) defaultOG(r *http.Request) openGraph {
	return openGraph{
		Title:       "SUB12 — Precision Shooting Platform",
		Description: "Track scores, manage gear, and compete in leagues. The platform for precision airgun shooters.",
		Image:       s.absolute("/og-image.png"),
		URL:         s.absoluteFromRequest(r),
		Type:        "website",
	}
}

// absolute turns a relative path into an absolute URL rooted at siteURL.
func (s *ShareMeta) absolute(p string) string {
	if p == "" {
		return ""
	}
	if strings.HasPrefix(p, "http://") || strings.HasPrefix(p, "https://") {
		return p
	}
	base := s.siteURL
	if base == "" {
		return p
	}
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	return base + p
}

func (s *ShareMeta) absoluteFromRequest(r *http.Request) string {
	if s.siteURL != "" {
		return s.siteURL + r.URL.Path
	}
	scheme := "https"
	if r.TLS == nil && r.Header.Get("X-Forwarded-Proto") != "https" {
		scheme = "http"
	}
	return scheme + "://" + r.Host + r.URL.Path
}

// writeHTML serves the SPA shell with the supplied OG tags injected.
func (s *ShareMeta) writeHTML(w http.ResponseWriter, r *http.Request, og openGraph) {
	if og.URL == "" {
		og.URL = s.absoluteFromRequest(r)
	}
	if og.Type == "" {
		og.Type = "website"
	}
	tmpl := s.template()
	body := injectOG(tmpl, og, s.siteName)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	// Short CDN/proxy cache so social platforms see fresh metadata after edits
	// without hammering the backend for every navigation.
	w.Header().Set("Cache-Control", "public, max-age=60")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

// template lazily fetches the SPA index.html from the configured frontend
// origin and caches it. Falls back to an embedded minimal template when the
// frontend isn't reachable (dev, first boot, etc.).
func (s *ShareMeta) template() []byte {
	s.once.Do(func() {
		if s.frontendOrigin == "" {
			s.tmpl = []byte(fallbackTemplate)
			return
		}
		for attempt := 0; attempt < 5; attempt++ {
			html, err := fetchIndexHTML(context.Background(), s.frontendOrigin)
			if err == nil {
				s.tmpl = html
				return
			}
			s.log.Warn().Err(err).Int("attempt", attempt+1).Str("origin", s.frontendOrigin).Msg("share_meta: failed to fetch frontend index.html")
			time.Sleep(time.Duration(attempt+1) * time.Second)
		}
		s.log.Warn().Str("origin", s.frontendOrigin).Msg("share_meta: using embedded fallback after retries exhausted")
		s.tmpl = []byte(fallbackTemplate)
	})
	return s.tmpl
}

func fetchIndexHTML(ctx context.Context, origin string) ([]byte, error) {
	u, err := url.Parse(origin)
	if err != nil {
		return nil, err
	}
	u.Path = "/index.html"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// Regexes scoped to tag attributes; all anchored to the beginning of an
// opening <meta ...> so we don't replace tags we didn't mean to.
var (
	reOGTitle        = regexp.MustCompile(`(?i)<meta\s+property="og:title"[^>]*>`)
	reOGDesc         = regexp.MustCompile(`(?i)<meta\s+property="og:description"[^>]*>`)
	reOGImage        = regexp.MustCompile(`(?i)<meta\s+property="og:image"[^>]*>`)
	reOGType         = regexp.MustCompile(`(?i)<meta\s+property="og:type"[^>]*>`)
	reOGURL          = regexp.MustCompile(`(?i)<meta\s+property="og:url"[^>]*>`)
	reOGSiteName     = regexp.MustCompile(`(?i)<meta\s+property="og:site_name"[^>]*>`)
	reTwitterTitle   = regexp.MustCompile(`(?i)<meta\s+name="twitter:title"[^>]*>`)
	reTwitterDesc    = regexp.MustCompile(`(?i)<meta\s+name="twitter:description"[^>]*>`)
	reTwitterImage   = regexp.MustCompile(`(?i)<meta\s+name="twitter:image"[^>]*>`)
	reDescription    = regexp.MustCompile(`(?i)<meta\s+name="description"[^>]*>`)
	rePageTitle      = regexp.MustCompile(`(?i)<title>[^<]*</title>`)
	reOGImageWHAlt   = regexp.MustCompile(`(?i)<meta\s+property="og:image:(width|height|alt)"[^>]*>`)
	reHeadOpen       = regexp.MustCompile(`(?i)<head[^>]*>`)
)

func metaProp(prop, content string) string {
	return fmt.Sprintf(`<meta property=%q content=%q />`, prop, content)
}

func metaName(name, content string) string {
	return fmt.Sprintf(`<meta name=%q content=%q />`, name, content)
}

// injectOG rewrites the OG/Twitter tags in the template. It replaces
// existing tags in place when present so there are no duplicates, and
// appends any missing tags after <head>. HTML-escapes all substituted
// values defensively.
func injectOG(tmpl []byte, og openGraph, siteName string) []byte {
	out := string(tmpl)

	title := html.EscapeString(og.Title)
	desc := html.EscapeString(og.Description)
	img := html.EscapeString(og.Image)
	ogURL := html.EscapeString(og.URL)
	ogType := html.EscapeString(og.Type)
	site := html.EscapeString(siteName)

	replacements := []struct {
		re  *regexp.Regexp
		tag string
	}{
		{rePageTitle, "<title>" + title + "</title>"},
		{reDescription, metaName("description", desc)},
		{reOGTitle, metaProp("og:title", title)},
		{reOGDesc, metaProp("og:description", desc)},
		{reOGImage, metaProp("og:image", img)},
		{reOGType, metaProp("og:type", ogType)},
		{reOGURL, metaProp("og:url", ogURL)},
		{reOGSiteName, metaProp("og:site_name", site)},
		{reTwitterTitle, metaName("twitter:title", title)},
		{reTwitterDesc, metaName("twitter:description", desc)},
		{reTwitterImage, metaName("twitter:image", img)},
	}

	// Strip og:image:width/height/alt because our dynamic image dimensions
	// are unknown; omitting is better than misleading.
	out = reOGImageWHAlt.ReplaceAllString(out, "")

	missing := make([]string, 0, len(replacements))
	for _, rep := range replacements {
		if rep.re.MatchString(out) {
			out = rep.re.ReplaceAllString(out, rep.tag)
		} else {
			missing = append(missing, rep.tag)
		}
	}

	if len(missing) > 0 {
		block := strings.Join(missing, "\n    ")
		out = reHeadOpen.ReplaceAllStringFunc(out, func(open string) string {
			return open + "\n    " + block
		})
	}

	return []byte(out)
}

// ── entity-specific copy helpers ────────────────────────────────────────────

func scoreCardDescription(card *model.ScoreCard) string {
	parts := []string{fmt.Sprintf("Total: %d (%dX)", card.TotalScore, card.XCount)}
	if card.Location != nil && *card.Location != "" {
		parts = append(parts, "at "+*card.Location)
	}
	if card.ShotAt != "" {
		parts = append(parts, "on "+card.ShotAt)
	}
	return strings.Join(parts, " ") + " — shared via sub-12."
}

func pelletTestTitle(sess *model.PelletTestSession) string {
	if sess.Pellet != nil {
		label := strings.TrimSpace(sess.Pellet.Brand + " " + sess.Pellet.Model)
		if label != "" {
			return "Pellet test: " + label
		}
	}
	return "Pellet test on sub-12"
}

func pelletTestDescription(sess *model.PelletTestSession) string {
	parts := []string{}
	if sess.Rifle != nil {
		parts = append(parts, "Rifle: "+strings.TrimSpace(sess.Rifle.Make+" "+sess.Rifle.Model))
	}
	if sess.BestGroupSizeMM != nil {
		parts = append(parts, fmt.Sprintf("Best group: %.2fmm", *sess.BestGroupSizeMM))
	}
	if sess.DistanceM > 0 {
		parts = append(parts, fmt.Sprintf("Distance: %.1fm", sess.DistanceM))
	}
	if len(parts) == 0 {
		return "Pellet testing session shared via sub-12."
	}
	return strings.Join(parts, " · ")
}

