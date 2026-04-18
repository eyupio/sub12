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
	rifles     *service.RifleService
	pellets    *service.PelletService
	siteURL    string
	siteName   string

	frontendOrigin string
	log            zerolog.Logger

	// Template cache. Re-fetched lazily once the TTL elapses so a frontend
	// redeploy (new hashed bundle filenames) is picked up within a minute
	// without a backend restart. The embedded fallback is never cached so a
	// cold-start race never persists past the next successful fetch.
	mu       sync.RWMutex
	cached   []byte
	cachedAt time.Time
	ttl      time.Duration
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
	rifles *service.RifleService,
	pellets *service.PelletService,
	siteURL, frontendOrigin string,
	log zerolog.Logger,
) *ShareMeta {
	return &ShareMeta{
		scoreCards:     scoreCards,
		pelletTest:     pelletTest,
		leagues:        leagues,
		clubs:          clubs,
		users:          users,
		rifles:         rifles,
		pellets:        pellets,
		siteURL:        strings.TrimRight(siteURL, "/"),
		siteName:       "SUB12",
		frontendOrigin: strings.TrimRight(frontendOrigin, "/"),
		log:            log,
		ttl:            60 * time.Second,
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
				displayName := s.lookupDisplayName(r.Context(), card.UserID)
				rifle := s.lookupRifle(r.Context(), card.RifleID, card.UserID)
				pellet := s.lookupPellet(r.Context(), card.PelletID, card.UserID)
				og.Title = scoreCardTitle(card, displayName)
				og.Description = scoreCardDescription(card, displayName, rifle, pellet)
				og.Image = s.absolute("/og/score-cards/" + id + ".png")
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
				displayName := s.lookupDisplayName(r.Context(), sess.UserID)
				og.Title = pelletTestTitle(sess)
				og.Description = pelletTestDescription(sess, displayName)
				og.Image = s.absolute("/og/pellet-tests/" + id + ".png")
				og.Type = "article"
			}
		}
		s.writeHTML(w, r, og)
	}
}

// League returns a handler for /share/leagues/{id}.
func (s *ShareMeta) League() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		og := s.defaultOG(r)
		id := chi.URLParam(r, "id")
		if id != "" && s.leagues != nil {
			league, err := s.leagues.GetByID(r.Context(), id, "")
			if err == nil && league != nil {
				og.Title = fmt.Sprintf("%s on sub-12", league.Name)
				og.Description = leagueDescription(league)
				og.Image = s.absolute("/og/leagues/" + id + ".png")
				og.Type = "article"
			}
		}
		s.writeHTML(w, r, og)
	}
}

// Club returns a handler for /share/clubs/{id}.
func (s *ShareMeta) Club() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		og := s.defaultOG(r)
		id := chi.URLParam(r, "id")
		if id != "" && s.clubs != nil {
			club, err := s.clubs.GetByID(r.Context(), id, "")
			if err == nil && club != nil {
				og.Title = fmt.Sprintf("%s on sub-12", club.Name)
				og.Description = clubDescription(club)
				og.Image = s.absolute("/og/clubs/" + id + ".png")
				og.Type = "article"
			}
		}
		s.writeHTML(w, r, og)
	}
}

// User returns a handler for /share/users/{id}.
func (s *ShareMeta) User() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		og := s.defaultOG(r)
		id := chi.URLParam(r, "id")
		if id != "" && s.users != nil {
			profile, err := s.users.GetPublicProfile(r.Context(), id)
			if err == nil && profile != nil && profile.ProfileVisibility != "private" {
				og.Title = fmt.Sprintf("%s on sub-12", profile.DisplayName)
				og.Description = userDescription(profile)
				og.Image = s.absolute("/og/users/" + id + ".png")
				og.Type = "profile"
			}
		}
		s.writeHTML(w, r, og)
	}
}

// lookupDisplayName returns the owner's display name if the profile is not
// private. Returns "" on any error so callers can degrade gracefully.
func (s *ShareMeta) lookupDisplayName(ctx context.Context, userID string) string {
	if s.users == nil || userID == "" {
		return ""
	}
	profile, err := s.users.GetPublicProfile(ctx, userID)
	if err != nil || profile == nil || profile.ProfileVisibility == "private" {
		return ""
	}
	return profile.DisplayName
}

func (s *ShareMeta) lookupRifle(ctx context.Context, rifleID *string, ownerID string) *model.Rifle {
	if s.rifles == nil || rifleID == nil || *rifleID == "" || ownerID == "" {
		return nil
	}
	rifle, err := s.rifles.GetByID(ctx, *rifleID, ownerID)
	if err != nil {
		return nil
	}
	return rifle
}

func (s *ShareMeta) lookupPellet(ctx context.Context, pelletID *string, ownerID string) *model.Pellet {
	if s.pellets == nil || pelletID == nil || *pelletID == "" || ownerID == "" {
		return nil
	}
	pellet, err := s.pellets.GetByID(ctx, *pelletID, ownerID)
	if err != nil {
		return nil
	}
	return pellet
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
	tmpl, isFallback := s.template()
	body := injectOG(tmpl, og, s.siteName)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if isFallback {
		// The fallback holding page embeds a JS reload so the real SPA takes
		// over once the frontend container is reachable. If we let browsers
		// or CDNs cache it, the reload serves the cached fallback back to
		// itself and the user is stuck. no-store ensures the next request
		// actually hits the backend and picks up the real shell.
		w.Header().Set("Cache-Control", "no-store")
	} else {
		// Short CDN/proxy cache so social platforms see fresh metadata after
		// edits without hammering the backend for every navigation.
		w.Header().Set("Cache-Control", "public, max-age=60")
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

// template returns the SPA index.html with a TTL-based re-fetch. On fetch
// failure we return the last known good shell if we have one, otherwise the
// embedded fallback — but we never cache the fallback. This means a cold
// start where the frontend container isn't up yet self-heals on the next
// request once the frontend is reachable. The isFallback return lets callers
// emit no-store on the HTTP response so the in-browser auto-reload isn't
// served a stale cached fallback.
func (s *ShareMeta) template() (body []byte, isFallback bool) {
	s.mu.RLock()
	if s.cached != nil && time.Since(s.cachedAt) < s.ttl {
		fresh := s.cached
		s.mu.RUnlock()
		return fresh, false
	}
	s.mu.RUnlock()

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cached != nil && time.Since(s.cachedAt) < s.ttl {
		return s.cached, false
	}
	if s.frontendOrigin == "" {
		return []byte(fallbackTemplate), true
	}

	fetchCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	html, err := fetchIndexHTML(fetchCtx, s.frontendOrigin)
	if err != nil {
		s.log.Warn().Err(err).Str("origin", s.frontendOrigin).Msg("share_meta: fetch failed, serving fallback")
		if s.cached != nil {
			return s.cached, false
		}
		return []byte(fallbackTemplate), true
	}
	s.cached = html
	s.cachedAt = time.Now()
	return s.cached, false
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
	reOGTitle      = regexp.MustCompile(`(?i)<meta\s+property="og:title"[^>]*>`)
	reOGDesc       = regexp.MustCompile(`(?i)<meta\s+property="og:description"[^>]*>`)
	reOGImage      = regexp.MustCompile(`(?i)<meta\s+property="og:image"[^>]*>`)
	reOGType       = regexp.MustCompile(`(?i)<meta\s+property="og:type"[^>]*>`)
	reOGURL        = regexp.MustCompile(`(?i)<meta\s+property="og:url"[^>]*>`)
	reOGSiteName   = regexp.MustCompile(`(?i)<meta\s+property="og:site_name"[^>]*>`)
	reTwitterTitle = regexp.MustCompile(`(?i)<meta\s+name="twitter:title"[^>]*>`)
	reTwitterDesc  = regexp.MustCompile(`(?i)<meta\s+name="twitter:description"[^>]*>`)
	reTwitterImage = regexp.MustCompile(`(?i)<meta\s+name="twitter:image"[^>]*>`)
	reDescription  = regexp.MustCompile(`(?i)<meta\s+name="description"[^>]*>`)
	rePageTitle    = regexp.MustCompile(`(?i)<title>[^<]*</title>`)
	reOGImageWHAlt = regexp.MustCompile(`(?i)<meta\s+property="og:image:(width|height|alt)"[^>]*>`)
	reHeadOpen     = regexp.MustCompile(`(?i)<head[^>]*>`)
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

func scoreCardTitle(card *model.ScoreCard, displayName string) string {
	score := fmt.Sprintf("%d points", card.TotalScore)
	if card.XCount > 0 {
		score = fmt.Sprintf("%d points (%dX)", card.TotalScore, card.XCount)
	}
	if displayName != "" {
		return fmt.Sprintf("%s shot %s on sub-12", displayName, score)
	}
	return score + " on sub-12"
}

func scoreCardDescription(card *model.ScoreCard, displayName string, rifle *model.Rifle, pellet *model.Pellet) string {
	parts := []string{}
	if displayName != "" {
		parts = append(parts, displayName)
	}
	parts = append(parts, fmt.Sprintf("%d (%dX)", card.TotalScore, card.XCount))
	if card.ShotAt != "" {
		parts = append(parts, card.ShotAt)
	}
	if card.Location != nil && *card.Location != "" {
		parts = append(parts, *card.Location)
	}
	gear := []string{}
	if rifle != nil {
		r := strings.TrimSpace(rifle.Make + " " + rifle.Model)
		if r != "" {
			gear = append(gear, r)
		}
	}
	if pellet != nil {
		p := strings.TrimSpace(pellet.Brand + " " + pellet.Model)
		if p != "" {
			gear = append(gear, p)
		}
	}
	if len(gear) > 0 {
		parts = append(parts, strings.Join(gear, " + "))
	}
	return strings.Join(parts, " • ") + " — shared via sub-12."
}

func pelletTestTitle(sess *model.PelletTestSession) string {
	if sess.Pellet != nil {
		label := strings.TrimSpace(sess.Pellet.Brand + " " + sess.Pellet.Model)
		if label != "" {
			return "Pellet test: " + label + " on sub-12"
		}
	}
	return "Pellet test on sub-12"
}

func pelletTestDescription(sess *model.PelletTestSession, displayName string) string {
	parts := []string{}
	if displayName != "" {
		parts = append(parts, displayName)
	}
	if sess.Rifle != nil {
		r := strings.TrimSpace(sess.Rifle.Make + " " + sess.Rifle.Model)
		if r != "" {
			parts = append(parts, r)
		}
	}
	if sess.BestGroupSizeMM != nil {
		parts = append(parts, fmt.Sprintf("Best %.2fmm", *sess.BestGroupSizeMM))
	}
	if sess.AverageGroupSizeMM != nil {
		parts = append(parts, fmt.Sprintf("Avg %.2fmm", *sess.AverageGroupSizeMM))
	}
	if sess.DistanceM > 0 {
		parts = append(parts, fmt.Sprintf("%.1fm", sess.DistanceM))
	}
	if sess.TestDate != "" {
		parts = append(parts, sess.TestDate)
	}
	if len(parts) == 0 {
		return "Pellet testing session shared via sub-12."
	}
	return strings.Join(parts, " · ") + " — shared via sub-12."
}

func leagueDescription(league *model.League) string {
	parts := []string{fmt.Sprintf("%d member%s", league.MemberCount, plural(league.MemberCount))}
	if league.Description != nil && strings.TrimSpace(*league.Description) != "" {
		parts = append(parts, truncate(*league.Description, 160))
	}
	return strings.Join(parts, " · ") + " — sub-12 league."
}

func clubDescription(club *model.Club) string {
	parts := []string{fmt.Sprintf("%d member%s", club.MemberCount, plural(club.MemberCount))}
	if club.Description != nil && strings.TrimSpace(*club.Description) != "" {
		parts = append(parts, truncate(*club.Description, 160))
	}
	return strings.Join(parts, " · ") + " — sub-12 club."
}

func userDescription(profile *model.PublicProfile) string {
	parts := []string{}
	if profile.Location != nil && *profile.Location != "" {
		parts = append(parts, *profile.Location)
	}
	if profile.Club != nil && *profile.Club != "" {
		parts = append(parts, *profile.Club)
	}
	if profile.Bio != nil && strings.TrimSpace(*profile.Bio) != "" {
		parts = append(parts, truncate(*profile.Bio, 160))
	}
	if len(parts) == 0 {
		return fmt.Sprintf("%s's profile on sub-12.", profile.DisplayName)
	}
	return strings.Join(parts, " · ") + " — on sub-12."
}

func plural(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}

// truncate returns s clipped to n runes with an ellipsis if it was clipped.
func truncate(s string, n int) string {
	s = strings.TrimSpace(s)
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return strings.TrimRight(string(runes[:n-1]), " ") + "…"
}
