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
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
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
	scoreCards   *service.ScoreCardService
	pelletTest   *service.PelletTestService
	leagues      *service.LeagueService
	clubs        *service.ClubService
	users        *service.UserService
	rifles       *service.RifleService
	pellets      *service.PelletService
	achievements *service.AchievementService
	siteURL      string
	siteName     string

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

	// Negative cache for a failing fetch. The fetch happens under the write
	// lock, so a frontend that is unreachable makes every share, /login and
	// /privacy request queue behind a 5s dial timeout — one broken container
	// turns into a backend that looks hung. Remember the failure briefly and
	// answer from the stale shell (or the fallback) instead of re-dialling on
	// every hit.
	failedAt time.Time
	failTTL  time.Duration
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
	achievements *service.AchievementService,
	siteURL, frontendOrigin string,
	log zerolog.Logger,
) *ShareMeta {
	trimmedSite := strings.TrimRight(siteURL, "/")
	if trimmedSite == "" {
		// absoluteFromRequest falls back to r.Host when siteURL is empty,
		// which is safe behind a trusted reverse proxy but opens host-header
		// injection into og:url when no such proxy is in front. Log loudly so
		// a missing SITE_URL in a non-dev env is hard to miss.
		log.Warn().Msg("share_meta: SITE_URL not configured; og:url will echo the request Host header — ensure a trusted reverse proxy rewrites Host, or set SITE_URL")
	}
	return &ShareMeta{
		scoreCards:     scoreCards,
		pelletTest:     pelletTest,
		leagues:        leagues,
		clubs:          clubs,
		users:          users,
		rifles:         rifles,
		pellets:        pellets,
		achievements:   achievements,
		siteURL:        trimmedSite,
		siteName:       "SUB12",
		frontendOrigin: strings.TrimRight(frontendOrigin, "/"),
		log:            log,
		ttl:            60 * time.Second,
		failTTL:        10 * time.Second,
	}
}

// openGraph is the data substituted into the HTML shell.
type openGraph struct {
	Title       string
	Description string
	Image       string // absolute URL
	ImageAlt    string // descriptive alt text for og:image
	URL         string // absolute URL of the share page
	Type        string // "article", "profile", "website"
	AuthorURL   string // absolute URL of the content owner's profile (article:author)
	AuthorName  string // owner's display name (og:profile:username, article:author name)
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
				author := s.lookupAuthor(r.Context(), card.UserID)
				displayName := authorDisplayName(author)
				rifle := s.lookupRifle(r.Context(), card.RifleID, card.UserID)
				pellet := s.lookupPellet(r.Context(), card.PelletID, card.UserID)
				achievements := s.lookupUserAchievements(r.Context(), card.UserID)
				og.Title = scoreCardTitle(card, displayName)
				og.Description = scoreCardDescription(card, displayName, rifle, pellet, achievements)
				og.Image = s.absolute("/og/score-cards/" + id + ".png")
				og.ImageAlt = scoreCardImageAlt(card, displayName)
				og.Type = "article"
				if author != nil {
					og.AuthorName = displayName
					og.AuthorURL = s.absolute("/share/users/" + shareRef(author.Slug, author.ID))
				}
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
				author := s.lookupAuthor(r.Context(), sess.UserID)
				displayName := authorDisplayName(author)
				og.Title = pelletTestTitle(sess)
				og.Description = pelletTestDescription(sess, displayName)
				og.Image = s.absolute("/og/pellet-tests/" + id + ".png")
				og.ImageAlt = pelletTestImageAlt(sess, displayName)
				og.Type = "article"
				if author != nil {
					og.AuthorName = displayName
					og.AuthorURL = s.absolute("/share/users/" + shareRef(author.Slug, author.ID))
				}
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
			league, err := s.leagues.GetByID(r.Context(), id, "", "")
			if err == nil && league != nil {
				ref := shareRef(league.Slug, league.ID)
				og.Title = fmt.Sprintf("%s on sub-12", league.Name)
				og.Description = leagueDescription(league)
				og.Image = s.absolute("/og/leagues/" + ref + ".png")
				og.ImageAlt = leagueImageAlt(league)
				og.Type = "article"
				og.URL = s.absolute("/share/leagues/" + ref)
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
			club, err := s.clubs.GetByID(r.Context(), id, "", "")
			if err == nil && club != nil {
				ref := shareRef(club.Slug, club.ID)
				og.Title = fmt.Sprintf("%s on sub-12", club.Name)
				og.Description = clubDescription(club)
				og.Image = s.absolute("/og/clubs/" + ref + ".png")
				og.ImageAlt = clubImageAlt(club)
				og.Type = "article"
				og.URL = s.absolute("/share/clubs/" + ref)
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
				ref := shareRef(profile.Slug, profile.ID)
				og.Title = fmt.Sprintf("%s on sub-12", profile.DisplayName)
				og.Description = userDescription(profile)
				og.Image = s.absolute("/og/users/" + ref + ".png")
				og.ImageAlt = userImageAlt(profile)
				og.Type = "profile"
				// Point og:url and rel=canonical at the slug form even when the
				// visitor arrived on the UUID one, so the two spellings of the
				// same page consolidate instead of competing.
				og.URL = s.absolute("/share/users/" + ref)
				// profile:username is the property Open Graph defines for
				// og:type=profile; without it a shared profile is just an
				// untyped page to anything consuming the graph.
				og.AuthorName = profile.DisplayName
			}
		}
		s.writeHTML(w, r, og)
	}
}

// lookupAuthor returns the owner's public profile, or nil when the owner is
// private or unresolvable, so callers can degrade to an unattributed preview.
func (s *ShareMeta) lookupAuthor(ctx context.Context, userID string) *model.PublicProfile {
	if s.users == nil || userID == "" {
		return nil
	}
	profile, err := s.users.GetPublicProfile(ctx, userID)
	if err != nil || profile == nil || profile.ProfileVisibility == "private" {
		return nil
	}
	return profile
}

// authorDisplayName is the nil-safe accessor callers use for copy.
func authorDisplayName(p *model.PublicProfile) string {
	if p == nil {
		return ""
	}
	return p.DisplayName
}

// lookupUserAchievements returns the owner's earned achievements as an
// anonymous viewer would see them. Errors degrade to nil so a transient
// failure never drops back to the default OG tags.
func (s *ShareMeta) lookupUserAchievements(ctx context.Context, userID string) []*model.UserAchievement {
	if s.achievements == nil || userID == "" {
		return nil
	}
	items, err := s.achievements.ListForUser(ctx, userID, "")
	if err != nil {
		return nil
	}
	return items
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
		ImageAlt:    "SUB12 — precision shooting platform for FT, HFT and benchrest",
		URL:         s.absoluteFromRequest(r),
		Type:        "website",
	}
}

// StaticPageMeta is the search metadata for one fixed public page.
type StaticPageMeta struct {
	Path        string
	Title       string
	Description string
}

// StaticPages are the anonymous-reachable pages that carry their own search
// metadata. The SPA shell ships a single hard-coded <title>, description and
// rel=canonical pointing at the site root, so without this every one of these
// URLs told Google it was a duplicate of the homepage — which is why they were
// submitted in the sitemap and then dropped from the index.
//
// The site root is deliberately absent: nginx serves "/" straight from the
// static bundle, whose baked-in tags are already correct for the homepage, and
// routing it through the backend would put the landing page behind the API's
// availability for no gain.
var StaticPages = []StaticPageMeta{
	{
		Path:        "/pellet-leaderboard",
		Title:       "Pellet Leaderboard — Tested Accuracy Rankings | SUB12",
		Description: "Community pellet test results ranked by measured group size. Compare .177 and .22 pellets by rifle, distance and conditions before you buy a tin.",
	},
	{
		Path:        "/register",
		Title:       "Create Your Free SUB12 Account",
		Description: "Sign up free to log 25-shot score cards, test pellets with image-based group measurement, track your gear and compete in FT, HFT and benchrest leagues.",
	},
	{
		Path:        "/login",
		Title:       "Sign In to SUB12",
		Description: "Sign in to your SUB12 account to log score cards, review pellet tests and check your league standings.",
	},
	{
		Path:        "/privacy",
		Title:       "Privacy Policy | SUB12",
		Description: "How SUB12 collects, uses and protects your personal data, and the rights you have over it.",
	},
	{
		Path:        "/terms",
		Title:       "Terms of Use | SUB12",
		Description: "The terms governing your use of the SUB12 platform, including acceptable use and account responsibilities.",
	},
	{
		Path:        "/cookies",
		Title:       "Cookie Policy | SUB12",
		Description: "The cookies and local storage SUB12 uses, what each is for, and how to control them.",
	},
}

// StaticPage returns a handler that serves the SPA shell with the supplied
// page's own title, description and self-referencing canonical injected. It
// touches no services and issues no queries, so these pages keep serving even
// when the database is unreachable.
func (s *ShareMeta) StaticPage(meta StaticPageMeta) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		og := s.defaultOG(r)
		og.Title = meta.Title
		og.Description = meta.Description
		// defaultOG already set URL from the request path, which is this
		// page's path (the routes are exact matches) and drops any query
		// string — so /login?next=... canonicalises to /login rather than
		// splintering into a URL per redirect target. Using it also keeps
		// og:url absolute when SITE_URL is unset, which s.absolute cannot.
		og.Type = "website"
		s.writeHTML(w, r, og)
	}
}

// shareRef prefers an entity's human-readable slug for public URLs, falling
// back to its UUID. The fallback covers the window between a row being
// inserted and its slug being claimed, and any row a backfill missed.
func shareRef(slug, id string) string {
	if slug != "" {
		return slug
	}
	return id
}

// isValidUUID reports whether s parses as a UUID. Used to short-circuit
// share-meta lookups for non-UUID path segments (e.g. /pellet-tests/leaderboard)
// so they don't reach the DB and log invalid-input errors.
func isValidUUID(s string) bool {
	_, err := uuid.Parse(s)
	return err == nil
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
	// Only two valid forwarded schemes; reject anything else so a crafted
	// X-Forwarded-Proto can't inject something like "javascript" into og:url.
	scheme := "https"
	if r.TLS == nil {
		switch strings.ToLower(r.Header.Get("X-Forwarded-Proto")) {
		case "https":
			scheme = "https"
		case "http":
			scheme = "http"
		default:
			scheme = "http"
		}
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
		// The holding page is a dead end for a human: it has no SPA bundle to
		// boot, so whoever followed the shared link just sits on it. nginx has
		// the real index.html on disk, so say "I could not build this" in the
		// only way it can act on — a 5xx it intercepts (see the `error_page
		// 502 503 504 = @spa_shell` blocks in frontend/nginx.conf) — and the
		// visitor gets the working app with the site-wide tags instead. The
		// body still carries the entity's OG tags for anything that reads a
		// 503, and Retry-After tells a crawler to come back rather than record
		// the degraded page.
		//
		// no-store because nothing about this response should outlive the
		// outage: cached, it would serve itself back to the retry and pin the
		// visitor on the holding page even after the frontend recovered.
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Retry-After", "5")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write(body)
		return
	}
	// Short CDN/proxy cache so social platforms see fresh metadata after
	// edits without hammering the backend for every navigation.
	w.Header().Set("Cache-Control", "public, max-age=60")
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
	if !s.failedAt.IsZero() && time.Since(s.failedAt) < s.failTTL {
		if s.cached != nil {
			return s.cached, false
		}
		return []byte(fallbackTemplate), true
	}

	fetchCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	html, err := fetchIndexHTML(fetchCtx, s.frontendOrigin)
	if err != nil {
		// Error, not Warn: with no cached shell to fall back on this is the
		// whole public surface — every share link, /login, /privacy — degraded
		// to a holding page that search engines are told not to index. A
		// misconfigured FRONTEND_ORIGIN produces exactly this and nothing else
		// fails, so it has to be loud.
		s.failedAt = time.Now()
		s.log.Error().Err(err).Str("origin", s.frontendOrigin).Bool("has_cached_shell", s.cached != nil).
			Msg("share_meta: cannot fetch the SPA shell from the frontend; shared links degrade to the holding page")
		if s.cached != nil {
			return s.cached, false
		}
		return []byte(fallbackTemplate), true
	}
	s.failedAt = time.Time{}
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
	// Cap the upstream response so a misbehaving or compromised frontend
	// container can't OOM the backend by serving an oversized index.html.
	return io.ReadAll(io.LimitReader(resp.Body, 1<<20))
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
	reOGImageAlt     = regexp.MustCompile(`(?i)<meta\s+property="og:image:alt"[^>]*>`)
	reOGImageWidth   = regexp.MustCompile(`(?i)<meta\s+property="og:image:width"[^>]*>`)
	reOGImageHeight  = regexp.MustCompile(`(?i)<meta\s+property="og:image:height"[^>]*>`)
	reOGImageType    = regexp.MustCompile(`(?i)<meta\s+property="og:image:type"[^>]*>`)
	reOGImageSecure  = regexp.MustCompile(`(?i)<meta\s+property="og:image:secure_url"[^>]*>`)
	reOGLocale       = regexp.MustCompile(`(?i)<meta\s+property="og:locale"[^>]*>`)
	reProfileUser    = regexp.MustCompile(`(?i)<meta\s+property="(og:)?profile:username"[^>]*>`)
	reArticleAuthor  = regexp.MustCompile(`(?i)<meta\s+property="article:author"[^>]*>`)
	reTwitterCard    = regexp.MustCompile(`(?i)<meta\s+name="twitter:card"[^>]*>`)
	reTwitterTitle   = regexp.MustCompile(`(?i)<meta\s+name="twitter:title"[^>]*>`)
	reTwitterDesc    = regexp.MustCompile(`(?i)<meta\s+name="twitter:description"[^>]*>`)
	reTwitterImage   = regexp.MustCompile(`(?i)<meta\s+name="twitter:image"[^>]*>`)
	reTwitterImgAlt  = regexp.MustCompile(`(?i)<meta\s+name="twitter:image:alt"[^>]*>`)
	reTwitterCreator = regexp.MustCompile(`(?i)<meta\s+name="twitter:creator"[^>]*>`)
	reDescription    = regexp.MustCompile(`(?i)<meta\s+name="description"[^>]*>`)
	reCanonical      = regexp.MustCompile(`(?i)<link\s+rel="canonical"[^>]*>`)
	rePageTitle      = regexp.MustCompile(`(?i)<title>[^<]*</title>`)
	reHeadOpen       = regexp.MustCompile(`(?i)<head[^>]*>`)
)

func metaProp(prop, content string) string {
	return fmt.Sprintf(`<meta property=%q content=%q />`, prop, content)
}

func metaName(name, content string) string {
	return fmt.Sprintf(`<meta name=%q content=%q />`, name, content)
}

func linkRel(rel, href string) string {
	return fmt.Sprintf(`<link rel=%q href=%q />`, rel, href)
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
	imgAlt := html.EscapeString(og.ImageAlt)
	ogURL := html.EscapeString(og.URL)
	ogType := html.EscapeString(og.Type)
	site := html.EscapeString(siteName)
	authorURL := html.EscapeString(og.AuthorURL)
	authorName := html.EscapeString(og.AuthorName)

	type replacement struct {
		re  *regexp.Regexp
		tag string
	}

	replacements := []replacement{
		{rePageTitle, "<title>" + title + "</title>"},
		{reDescription, metaName("description", desc)},
		{reOGTitle, metaProp("og:title", title)},
		{reOGDesc, metaProp("og:description", desc)},
		{reOGImage, metaProp("og:image", img)},
		{reOGType, metaProp("og:type", ogType)},
		{reOGURL, metaProp("og:url", ogURL)},
		{reOGSiteName, metaProp("og:site_name", site)},
		{reOGLocale, metaProp("og:locale", "en_GB")},
		{reTwitterTitle, metaName("twitter:title", title)},
		{reTwitterDesc, metaName("twitter:description", desc)},
		{reTwitterImage, metaName("twitter:image", img)},
		// Pinned rather than inherited from the template: a missing or
		// downgraded twitter:card turns a full-bleed preview into a small
		// square thumbnail, which is the difference between a share that
		// advertises sub-12 and one that doesn't.
		{reTwitterCard, metaName("twitter:card", "summary_large_image")},
		// Every image we point og:image at — the per-entity renders and the
		// static site default alike — is a 1200×630 PNG. Declaring that is
		// what lets Facebook and LinkedIn lay the card out at the intended
		// 1.91:1 on first scrape instead of guessing an aspect ratio and
		// centre-cropping the artwork.
		{reOGImageWidth, metaProp("og:image:width", strconv.Itoa(ogWidth))},
		{reOGImageHeight, metaProp("og:image:height", strconv.Itoa(ogHeight))},
		{reOGImageType, metaProp("og:image:type", "image/png")},
		// Canonical: the SPA shell hard-codes the site root, which would have
		// every share page declaring itself a duplicate of the homepage and
		// getting folded away in search results.
		{reCanonical, linkRel("canonical", ogURL)},
	}

	if strings.HasPrefix(og.Image, "https://") {
		replacements = append(replacements, replacement{reOGImageSecure, metaProp("og:image:secure_url", img)})
	} else {
		out = reOGImageSecure.ReplaceAllString(out, "")
	}

	// og:image:alt: inject when we have alt text, drop any stale tag
	// otherwise so we don't surface copy from a previous entity render.
	if imgAlt != "" {
		replacements = append(replacements,
			replacement{reOGImageAlt, metaProp("og:image:alt", imgAlt)},
			replacement{reTwitterImgAlt, metaName("twitter:image:alt", imgAlt)},
		)
	} else {
		out = reOGImageAlt.ReplaceAllString(out, "")
		out = reTwitterImgAlt.ReplaceAllString(out, "")
	}

	// Author attribution for article-type OG (profile:username +
	// article:author + twitter:creator). Only emitted when we resolved an
	// owner so anonymous / private shares don't leak a misleading byline.
	if authorName != "" {
		replacements = append(replacements,
			replacement{reProfileUser, metaProp("profile:username", authorName)},
			replacement{reTwitterCreator, metaName("twitter:creator", authorName)},
		)
	} else {
		out = reProfileUser.ReplaceAllString(out, "")
		out = reTwitterCreator.ReplaceAllString(out, "")
	}
	if authorURL != "" {
		replacements = append(replacements, replacement{reArticleAuthor, metaProp("article:author", authorURL)})
	} else {
		out = reArticleAuthor.ReplaceAllString(out, "")
	}

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

func scoreCardDescription(card *model.ScoreCard, displayName string, rifle *model.Rifle, pellet *model.Pellet, achievements []*model.UserAchievement) string {
	parts := []string{}
	if displayName != "" {
		parts = append(parts, displayName)
	}
	score := fmt.Sprintf("%d points", card.TotalScore)
	if card.XCount > 0 {
		score = fmt.Sprintf("%d points (%dX)", card.TotalScore, card.XCount)
	}
	parts = append(parts, score)
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
	if names := topAchievementNames(achievements, 2); names != "" {
		parts = append(parts, names)
	}
	return strings.Join(parts, " · ")
}

// scoreCardImageAlt builds descriptive alt text used for og:image:alt so
// screen readers and accessibility tooling convey who achieved what.
func scoreCardImageAlt(card *model.ScoreCard, displayName string) string {
	score := fmt.Sprintf("%d points", card.TotalScore)
	if card.XCount > 0 {
		score = fmt.Sprintf("%d points (%dX)", card.TotalScore, card.XCount)
	}
	if displayName != "" {
		return fmt.Sprintf("%s — %s on sub-12", displayName, score)
	}
	return score + " on sub-12"
}

// pelletTestImageAlt describes the pellet-test preview card so screen readers
// parse it as more than just "image". Mirrors scoreCardImageAlt in tone.
func pelletTestImageAlt(sess *model.PelletTestSession, displayName string) string {
	label := "Pellet test"
	if sess.Pellet != nil {
		if p := strings.TrimSpace(sess.Pellet.Brand + " " + sess.Pellet.Model); p != "" {
			label = "Pellet test: " + p
		}
	}
	if sess.BestGroupSizeMM != nil {
		label += fmt.Sprintf(" — Best %.2fmm", *sess.BestGroupSizeMM)
	}
	if displayName != "" {
		return displayName + " — " + label + " on sub-12"
	}
	return label + " on sub-12"
}

func leagueImageAlt(league *model.League) string {
	return fmt.Sprintf("%s — %d member%s on sub-12", league.Name, league.MemberCount, plural(league.MemberCount))
}

func clubImageAlt(club *model.Club) string {
	return fmt.Sprintf("%s — %d member%s on sub-12", club.Name, club.MemberCount, plural(club.MemberCount))
}

func userImageAlt(profile *model.PublicProfile) string {
	return fmt.Sprintf("%s on sub-12", profile.DisplayName)
}

// topAchievementNames returns a comma-joined list of the most recently earned
// achievement names (up to max). Returns "" when there are none.
func topAchievementNames(achievements []*model.UserAchievement, max int) string {
	if len(achievements) == 0 || max <= 0 {
		return ""
	}
	if len(achievements) < max {
		max = len(achievements)
	}
	names := make([]string, 0, max)
	for i := 0; i < max; i++ {
		n := strings.TrimSpace(achievements[i].Name)
		if n != "" {
			names = append(names, n)
		}
	}
	return strings.Join(names, ", ")
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
		return "Pellet testing session"
	}
	return strings.Join(parts, " · ")
}

func leagueDescription(league *model.League) string {
	parts := []string{fmt.Sprintf("%d member%s", league.MemberCount, plural(league.MemberCount))}
	if league.Description != nil && strings.TrimSpace(*league.Description) != "" {
		parts = append(parts, truncate(*league.Description, 160))
	}
	return strings.Join(parts, " · ")
}

func clubDescription(club *model.Club) string {
	parts := []string{fmt.Sprintf("%d member%s", club.MemberCount, plural(club.MemberCount))}
	if club.Description != nil && strings.TrimSpace(*club.Description) != "" {
		parts = append(parts, truncate(*club.Description, 160))
	}
	return strings.Join(parts, " · ")
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
		return fmt.Sprintf("%s's profile", profile.DisplayName)
	}
	return strings.Join(parts, " · ")
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
