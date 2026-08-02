package handler

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

func TestTemplate_CachesSuccessfulFetch(t *testing.T) {
	var calls int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		_, _ = w.Write([]byte(`<!doctype html><html><head><title>x</title></head><body></body></html>`))
	}))
	defer ts.Close()

	s := newShareMetaForTest(ts.URL, 500*time.Millisecond)
	first, firstFallback := s.template()
	second, secondFallback := s.template()

	assert.Equal(t, first, second, "template should be re-used while cache is fresh")
	assert.False(t, firstFallback, "successful fetch should not be flagged as fallback")
	assert.False(t, secondFallback, "cached successful fetch should not be flagged as fallback")
	assert.EqualValues(t, 1, atomic.LoadInt32(&calls), "only one upstream fetch while cache is fresh")
}

func TestTemplate_RefetchesAfterTTL(t *testing.T) {
	var calls int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		_, _ = w.Write([]byte(`<!doctype html><html><head><title>x</title></head></html>`))
	}))
	defer ts.Close()

	s := newShareMetaForTest(ts.URL, 10*time.Millisecond)
	s.template()
	time.Sleep(25 * time.Millisecond)
	s.template()

	assert.EqualValues(t, 2, atomic.LoadInt32(&calls), "stale cache should trigger a re-fetch")
}

func TestTemplate_FetchFailureDoesNotPoisonCache(t *testing.T) {
	// Server always 500s — template() should return the embedded fallback
	// every time but never cache it, so a later successful request would
	// replace it immediately. Verify by flipping the server.
	failing := int32(1)
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if atomic.LoadInt32(&failing) == 1 {
			http.Error(w, "boom", http.StatusInternalServerError)
			return
		}
		_, _ = w.Write([]byte(`<!doctype html><html><head><title>real</title></head></html>`))
	}))
	defer ts.Close()

	s := newShareMetaForTest(ts.URL, 10*time.Millisecond)

	body, isFallback := s.template()
	assert.Contains(t, string(body), "Getting things ready", "fallback HTML should be served on fetch failure")
	assert.True(t, isFallback, "template() should flag the embedded fallback so callers can emit no-store")

	// Flip the server healthy and wait out the TTL.
	atomic.StoreInt32(&failing, 0)
	time.Sleep(25 * time.Millisecond)

	body, isFallback = s.template()
	assert.Contains(t, string(body), "<title>real</title>", "next request after recovery should pick up the real template")
	assert.False(t, isFallback, "recovered shell should not be flagged as fallback")
}

func TestWriteHTML_CacheControlMatchesTemplateSource(t *testing.T) {
	// Real shell: browsers and CDNs may cache briefly so social platforms
	// don't re-parse on every navigation.
	ok := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`<!doctype html><html><head><title>x</title></head></html>`))
	}))
	defer ok.Close()

	s := newShareMetaForTest(ok.URL, time.Minute)
	rec := httptest.NewRecorder()
	s.writeHTML(rec, httptest.NewRequest(http.MethodGet, "/score-cards/abc", nil), s.defaultOG(httptest.NewRequest(http.MethodGet, "/score-cards/abc", nil)))
	assert.Equal(t, "public, max-age=60", rec.Header().Get("Cache-Control"), "successful shell must remain cacheable")

	// Fallback: the embedded holding page must never be cached, or it outlives
	// the outage — served back to the retry, and pinned against the share URL
	// long after the backend can build the real thing again.
	down := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer down.Close()

	s2 := newShareMetaForTest(down.URL, time.Minute)
	rec2 := httptest.NewRecorder()
	s2.writeHTML(rec2, httptest.NewRequest(http.MethodGet, "/score-cards/abc", nil), s2.defaultOG(httptest.NewRequest(http.MethodGet, "/score-cards/abc", nil)))
	assert.Equal(t, "no-store", rec2.Header().Get("Cache-Control"), "fallback holding page must not be cached")
	assert.Contains(t, rec2.Body.String(), "Getting things ready", "fallback body should be the embedded holding page")
}

func TestScoreCardDescription_RichesWithGear(t *testing.T) {
	loc := "Birmingham Club"
	card := &model.ScoreCard{
		TotalScore: 245,
		XCount:     12,
		ShotAt:     "2026-04-18",
		Location:   &loc,
	}
	rifle := &model.Rifle{Make: "Air Arms", Model: "S510"}
	pellet := &model.Pellet{Brand: "JSB", Model: "Exact 4.52mm"}

	got := scoreCardDescription(card, "John Shooter", rifle, pellet, nil)

	assert.Contains(t, got, "John Shooter")
	assert.Contains(t, got, "245 points (12X)")
	assert.Contains(t, got, "2026-04-18")
	assert.Contains(t, got, "Birmingham Club")
	assert.Contains(t, got, "Air Arms S510")
	assert.Contains(t, got, "JSB Exact 4.52mm")
	// Brand tail removed so first line of the preview card is all signal; og:site_name carries the brand.
	assert.NotContains(t, got, "shared via sub-12")
}

func TestScoreCardDescription_IncludesTopAchievements(t *testing.T) {
	card := &model.ScoreCard{TotalScore: 245, XCount: 12}
	achievements := []*model.UserAchievement{
		{AchievementDef: model.AchievementDef{ID: "perfect_card", Name: "Perfect Card"}},
		{AchievementDef: model.AchievementDef{ID: "century_club", Name: "Century Club"}},
		{AchievementDef: model.AchievementDef{ID: "third", Name: "Third"}},
	}

	got := scoreCardDescription(card, "John Shooter", nil, nil, achievements)

	assert.Contains(t, got, "Perfect Card")
	assert.Contains(t, got, "Century Club")
	// Only the first two are surfaced so the description stays scannable.
	assert.NotContains(t, got, "Third")
}

func TestScoreCardDescription_MinimalCardDegrades(t *testing.T) {
	card := &model.ScoreCard{TotalScore: 200, XCount: 0}
	got := scoreCardDescription(card, "", nil, nil, nil)

	// Zero-X omits the "(0X)" noise; title and description both just say "points".
	assert.Contains(t, got, "200 points")
	assert.NotContains(t, got, "(0X)")
	assert.NotContains(t, got, "shared via sub-12")
}

func TestScoreCardDescription_UsesMiddleDotSeparator(t *testing.T) {
	// All entity descriptions should use the same " · " (U+00B7) joiner; score
	// cards previously used " • " (U+2022) which showed up as a second bullet
	// next to all the others in a unified social feed.
	card := &model.ScoreCard{TotalScore: 200}
	got := scoreCardDescription(card, "John", nil, nil, nil)

	assert.Contains(t, got, " · ")
	assert.NotContains(t, got, " • ")
}

func TestTruncate_HandlesRunes(t *testing.T) {
	assert.Equal(t, "abc", truncate("abc", 10))
	assert.Equal(t, "abcdefgh…", truncate("abcdefghij", 9))
	assert.Equal(t, "short", truncate("   short   ", 10))
}

func TestAbsoluteFromRequest_OnlyAcceptsHTTPOrHTTPS(t *testing.T) {
	// When SITE_URL is empty, absoluteFromRequest falls back to Host + scheme
	// inference. Only accept canonical schemes so a crafted X-Forwarded-Proto
	// like "javascript" can't slip into og:url / canonical metadata.
	s := &ShareMeta{log: zerolog.Nop()} // siteURL intentionally blank

	cases := []struct {
		name   string
		header string
		expect string
	}{
		{"https forwarded", "https", "https://example.test/x"},
		{"http forwarded", "http", "http://example.test/x"},
		{"empty forwarded", "", "http://example.test/x"},
		{"bogus forwarded", "javascript", "http://example.test/x"},
		{"mixed case https", "HTTPS", "https://example.test/x"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "http://example.test/x", nil)
			if tc.header != "" {
				req.Header.Set("X-Forwarded-Proto", tc.header)
			}
			assert.Equal(t, tc.expect, s.absoluteFromRequest(req))
		})
	}
}

func TestImageAlt_EveryShareTypeProducesNonEmptyAlt(t *testing.T) {
	// og:image:alt was only populated for score cards; screen readers and
	// accessibility linters flagged every other share type. Verify each
	// helper returns descriptive, non-empty text even when metadata is thin.
	best := 8.42
	sess := &model.PelletTestSession{
		Pellet:          &model.Pellet{Brand: "JSB", Model: "Hades"},
		BestGroupSizeMM: &best,
	}
	assert.Contains(t, pelletTestImageAlt(sess, "John Shooter"), "John Shooter")
	assert.Contains(t, pelletTestImageAlt(sess, "John Shooter"), "JSB Hades")
	assert.Contains(t, pelletTestImageAlt(sess, "John Shooter"), "Best 8.42mm")
	assert.Contains(t, pelletTestImageAlt(&model.PelletTestSession{}, ""), "Pellet test")

	league := &model.League{Name: "Rotary Shooting League", MemberCount: 12}
	assert.Contains(t, leagueImageAlt(league), "Rotary Shooting League")
	assert.Contains(t, leagueImageAlt(league), "12 members")

	club := &model.Club{Name: "Birmingham Club", MemberCount: 1}
	assert.Contains(t, clubImageAlt(club), "Birmingham Club")
	assert.Contains(t, clubImageAlt(club), "1 member")
	assert.NotContains(t, clubImageAlt(club), "1 members")

	profile := &model.PublicProfile{DisplayName: "John Shooter"}
	assert.Contains(t, userImageAlt(profile), "John Shooter")
}

func TestFallbackTemplate_IsSafeForOutages(t *testing.T) {
	// Crawlers landing on the holding page during a cold start must not index
	// "Getting things ready" as the canonical title.
	assert.Contains(t, fallbackTemplate, `name="robots" content="noindex"`)
	assert.NotContains(t, fallbackTemplate, `http-equiv="refresh"`)
}

func TestFallbackTemplate_NeedsNoJavaScript(t *testing.T) {
	// The page is served with `script-src 'self'`, which blocks inline
	// <script> and inline event handlers. A previous version told the visitor
	// "this page will refresh automatically" from an inline script the browser
	// silently refused to run, and offered a button wired to an onclick the
	// browser also refused — so the holding page never left, which is the whole
	// reason shared links dead-ended. Anything added here must work with no
	// script at all.
	assert.NotContains(t, fallbackTemplate, "<script", "the fallback must not depend on inline script")
	assert.NotRegexp(t, `(?i)\son[a-z]+\s*=`, fallbackTemplate, "inline event handlers are blocked by our CSP")
	assert.Contains(t, fallbackTemplate, `href="/"`, "the visitor needs a way out that is not this URL again")
}

func TestWriteHTML_FallbackAsksTheProxyToServeTheRealShell(t *testing.T) {
	// The holding page cannot boot the app, so serving it 200 leaves whoever
	// followed a shared link stuck on it. 503 is the signal nginx intercepts
	// (`error_page 502 503 504 = @spa_shell`) to serve index.html off disk
	// instead. Downgrade this to 200 and the dead end comes straight back.
	down := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer down.Close()

	s := newShareMetaForTest(down.URL, time.Minute)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/score-cards/abc", nil)
	s.writeHTML(rec, req, s.defaultOG(req))

	assert.Equal(t, http.StatusServiceUnavailable, rec.Code)
	assert.Equal(t, "5", rec.Header().Get("Retry-After"))
}

// TestNginx_ProxiedHTMLRoutesFallBackToTheStaticShell pins the other half of
// the same contract. The backend can only ask; nginx is what actually rescues
// the visitor, and the two files are edited independently.
func TestNginx_ProxiedHTMLRoutesFallBackToTheStaticShell(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "frontend", "nginx.conf"))
	if err != nil {
		t.Skipf("nginx.conf not readable from this checkout: %v", err)
	}
	conf := string(raw)

	assert.Contains(t, conf, "location @spa_shell", "no @spa_shell fallback defined")
	assert.Contains(t, conf, "try_files /index.html", "@spa_shell must serve the bundled shell from disk")

	// Every location that proxies an HTML page to the backend needs the
	// fallback; the OG image and /api/ blocks deliberately do not.
	for _, block := range []string{
		`location ~ ^/(score-cards|pellet-tests)/[^/]+$ {`,
		`location ~ ^/share/(leagues|clubs|users)/[^/]+$ {`,
		`location ~ ^/(pellet-leaderboard|register|login|privacy|terms|cookies)$ {`,
	} {
		start := strings.Index(conf, block)
		if !assert.NotEqual(t, -1, start, "location block missing from nginx.conf: %s", block) {
			continue
		}
		body := conf[start:]
		if end := strings.Index(body, "\n    }"); end != -1 {
			body = body[:end]
		}
		assert.Contains(t, body, "proxy_intercept_errors on;", "%s does not intercept backend errors", block)
		assert.Contains(t, body, "error_page 502 503 504 = @spa_shell;", "%s has no static-shell fallback", block)
	}
}

func TestInjectOG_ReplacesTagsInPlace(t *testing.T) {
	tmpl := []byte(`<!doctype html>
<html>
  <head>
    <title>Old</title>
    <meta name="description" content="old desc" />
    <meta property="og:title" content="old" />
    <meta property="og:description" content="old" />
    <meta property="og:image" content="/old.png" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="" />
    <meta property="og:site_name" content="SUB12" />
    <meta property="og:image:width" content="1200" />
    <meta name="twitter:title" content="old" />
    <meta name="twitter:description" content="old" />
    <meta name="twitter:image" content="/old.png" />
  </head>
</html>`)
	og := openGraph{
		Title:       "Fresh Title",
		Description: "Fresh Desc",
		Image:       "https://example.com/new.png",
		URL:         "https://example.com/score-cards/abc",
		Type:        "article",
	}

	out := string(injectOG(tmpl, og, "SUB12"))

	assert.Contains(t, out, "<title>Fresh Title</title>")
	assert.Contains(t, out, `content="Fresh Desc"`)
	assert.Contains(t, out, `content="https://example.com/new.png"`)
	assert.Contains(t, out, `content="article"`)
	// No duplicate og:title tags
	assert.Equal(t, 1, strings.Count(out, `property="og:title"`))
}

func TestInjectOG_DeclaresImageDimensionsAndCardType(t *testing.T) {
	// Regression test for previews being centre-cropped: without declared
	// dimensions and a pinned card type, Facebook and LinkedIn guess the
	// aspect ratio on first scrape and crop the artwork. Every image we point
	// og:image at is a 1200×630 PNG, so say so.
	tmpl := []byte(`<!doctype html>
<html>
  <head>
    <title>Old</title>
    <meta property="og:image:width" content="640" />
    <meta name="twitter:card" content="summary" />
    <link rel="canonical" href="https://sub12.io/" />
  </head>
</html>`)
	og := openGraph{
		Title: "Fresh", Description: "Desc",
		Image: "https://example.com/og/users/abc.png",
		URL:   "https://example.com/share/users/abc",
		Type:  "profile",
	}

	out := string(injectOG(tmpl, og, "SUB12"))

	assert.Contains(t, out, `property="og:image:width" content="1200"`)
	assert.Contains(t, out, `property="og:image:height" content="630"`)
	assert.Contains(t, out, `property="og:image:type" content="image/png"`)
	assert.Contains(t, out, `property="og:image:secure_url" content="https://example.com/og/users/abc.png"`)
	assert.Contains(t, out, `property="og:locale" content="en_GB"`)
	assert.Contains(t, out, `name="twitter:card" content="summary_large_image"`)
	assert.NotContains(t, out, `content="summary"/`)
	assert.Equal(t, 1, strings.Count(out, `property="og:image:width"`))
	assert.Equal(t, 1, strings.Count(out, `name="twitter:card"`))

	// The shell hard-codes the site root as canonical; each share page must
	// claim its own URL or search engines fold them into the homepage.
	assert.Contains(t, out, `<link rel="canonical" href="https://example.com/share/users/abc" />`)
	assert.NotContains(t, out, `href="https://sub12.io/"`)
	assert.Equal(t, 1, strings.Count(out, `rel="canonical"`))
}

func TestInjectOG_OmitsSecureImageURLWhenNotHTTPS(t *testing.T) {
	tmpl := []byte(`<!doctype html>
<html>
  <head>
    <meta property="og:image:secure_url" content="stale" />
  </head>
</html>`)
	og := openGraph{Title: "SUB12", Description: "…", Image: "http://localhost:8080/og-image.png", URL: "http://localhost:8080/", Type: "website"}

	out := string(injectOG(tmpl, og, "SUB12"))

	assert.NotContains(t, out, "og:image:secure_url")
}

func TestInjectOG_EmitsAuthorAndImageAltWhenSet(t *testing.T) {
	tmpl := []byte(`<!doctype html>
<html>
  <head>
    <title>Old</title>
    <meta property="og:title" content="old" />
  </head>
</html>`)
	og := openGraph{
		Title:       "John Shooter shot 245 points (12X) on sub-12",
		Description: "John Shooter • 245 (12X)",
		Image:       "https://example.com/og.png",
		ImageAlt:    "John Shooter — 245 points (12X) on sub-12",
		URL:         "https://example.com/score-cards/abc",
		Type:        "article",
		AuthorName:  "John Shooter",
		AuthorURL:   "https://example.com/share/users/abc",
	}

	out := string(injectOG(tmpl, og, "SUB12"))

	assert.Contains(t, out, `property="profile:username" content="John Shooter"`)
	assert.Contains(t, out, `property="article:author" content="https://example.com/share/users/abc"`)
	assert.Contains(t, out, `property="og:image:alt" content="John Shooter — 245 points (12X) on sub-12"`)
	assert.Contains(t, out, `name="twitter:image:alt" content="John Shooter — 245 points (12X) on sub-12"`)
	assert.Contains(t, out, `name="twitter:creator" content="John Shooter"`)
}

func TestInjectOG_OmitsAuthorWhenUnknown(t *testing.T) {
	tmpl := []byte(`<!doctype html>
<html>
  <head>
    <meta property="profile:username" content="stale" />
    <meta name="twitter:image:alt" content="stale" />
    <meta property="article:author" content="stale" />
    <meta property="og:image:alt" content="stale" />
    <meta name="twitter:creator" content="stale" />
  </head>
</html>`)
	og := openGraph{Title: "SUB12", Description: "…", Image: "/og.png", URL: "/", Type: "website"}

	out := string(injectOG(tmpl, og, "SUB12"))

	assert.NotContains(t, out, "stale")
	assert.NotContains(t, out, "profile:username")
	assert.NotContains(t, out, "article:author")
	assert.NotContains(t, out, "og:image:alt")
	assert.NotContains(t, out, "twitter:image:alt")
	assert.NotContains(t, out, "twitter:creator")
}

func newShareMetaForTest(frontendOrigin string, ttl time.Duration) *ShareMeta {
	return &ShareMeta{
		siteURL:        "https://example.com",
		siteName:       "SUB12",
		frontendOrigin: strings.TrimRight(frontendOrigin, "/"),
		log:            zerolog.Nop(),
		ttl:            ttl,
		// Scaled to the cache TTL so a test that flips a server healthy and
		// waits out the TTL isn't answered from the negative cache.
		failTTL: ttl / 4,
	}
}

func TestShareRef_PrefersSlugAndFallsBackToID(t *testing.T) {
	assert.Equal(t, "paul-jennings", shareRef("paul-jennings", "bb2c625d-6dc4-4f9e-9f1c-04fc13b46ce6"))
	// A row inserted but not yet slugged, or one a backfill missed, still has
	// to produce a working URL.
	assert.Equal(t, "bb2c625d-6dc4-4f9e-9f1c-04fc13b46ce6", shareRef("", "bb2c625d-6dc4-4f9e-9f1c-04fc13b46ce6"))
}

func TestInjectOG_CanonicalUsesTheSlugURLEvenWhenServedTheUUIDOne(t *testing.T) {
	// The whole point of canonicalising: a visitor may arrive on either
	// spelling, but search engines and social platforms must be told there is
	// one page, at the readable URL.
	tmpl := []byte(`<!doctype html><html><head><title>x</title></head></html>`)
	og := openGraph{
		Title:       "Paul Jennings on sub-12",
		Description: "Yorkshire",
		Image:       "https://sub12.io/og/users/paul-jennings.png",
		URL:         "https://sub12.io/share/users/paul-jennings",
		Type:        "profile",
	}

	out := string(injectOG(tmpl, og, "SUB12"))

	assert.Contains(t, out, `<link rel="canonical" href="https://sub12.io/share/users/paul-jennings" />`)
	assert.Contains(t, out, `property="og:url" content="https://sub12.io/share/users/paul-jennings"`)
	assert.NotContains(t, out, "bb2c625d")
}

func TestStaticPage_GivesEachPageItsOwnCanonicalAndTitle(t *testing.T) {
	// The SPA shell ships one hard-coded <title>, description and
	// rel=canonical pointing at the site root. Served as-is, every public
	// page declares itself a duplicate of the homepage, so Google drops the
	// ones we submit in the sitemap. Each must claim its own URL instead.
	shell := `<!doctype html>
<html>
  <head>
    <title>SUB12 — Score Cards, Pellet Testing, Leagues &amp; Events for FT / HFT</title>
    <meta name="description" content="site-wide blurb" />
    <meta property="og:url" content="https://sub12.io/" />
    <link rel="canonical" href="https://sub12.io/" />
  </head>
</html>`
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(shell))
	}))
	defer ts.Close()

	s := newShareMetaForTest(ts.URL, time.Minute)

	page := StaticPageMeta{
		Path:        "/pellet-leaderboard",
		Title:       "Pellet Leaderboard — Tested Accuracy Rankings | SUB12",
		Description: "Community pellet test results ranked by measured group size.",
	}

	rec := httptest.NewRecorder()
	s.StaticPage(page)(rec, httptest.NewRequest(http.MethodGet, "/pellet-leaderboard", nil))

	assert.Equal(t, http.StatusOK, rec.Code)
	body := rec.Body.String()

	assert.Contains(t, body, `<link rel="canonical" href="https://example.com/pellet-leaderboard" />`)
	assert.Contains(t, body, `property="og:url" content="https://example.com/pellet-leaderboard"`)
	assert.Contains(t, body, "<title>"+page.Title+"</title>")
	assert.Contains(t, body, `name="description" content="`+page.Description+`"`)

	// The shell's homepage canonical must be gone, not merely joined.
	assert.NotContains(t, body, `href="https://sub12.io/"`)
	assert.Equal(t, 1, strings.Count(body, `rel="canonical"`))
	assert.Equal(t, 1, strings.Count(body, "<title>"))
}

func TestStaticPage_DropsQueryStringFromCanonical(t *testing.T) {
	// /login?next=/scores and /login are the same page. Without this they
	// compete as separate URLs and split their own ranking signals.
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`<!doctype html><html><head><title>x</title>` +
			`<link rel="canonical" href="https://sub12.io/" /></head></html>`))
	}))
	defer ts.Close()

	s := newShareMetaForTest(ts.URL, time.Minute)
	page := StaticPageMeta{Path: "/login", Title: "Sign In to SUB12", Description: "Sign in."}

	rec := httptest.NewRecorder()
	s.StaticPage(page)(rec, httptest.NewRequest(http.MethodGet, "/login?next=%2Fscores", nil))

	assert.Contains(t, rec.Body.String(), `<link rel="canonical" href="https://example.com/login" />`)
	assert.NotContains(t, rec.Body.String(), "next=")
}

func TestStaticPages_AreUniqueAndAbsolutePaths(t *testing.T) {
	seen := map[string]bool{}
	for _, page := range StaticPages {
		assert.True(t, strings.HasPrefix(page.Path, "/"), "path must be rooted: %s", page.Path)
		assert.NotEqual(t, "/", page.Path,
			"the site root is served by nginx from the static bundle, not through ShareMeta")
		assert.False(t, seen[page.Path], "duplicate static page %s", page.Path)
		seen[page.Path] = true

		assert.NotEmpty(t, page.Title, "%s needs its own title", page.Path)
		assert.NotEmpty(t, page.Description, "%s needs its own description", page.Path)
		// Search results truncate well before this; a description longer than
		// ~160 characters is a sign it was written for the page, not the SERP.
		assert.LessOrEqual(t, len(page.Description), 200,
			"%s description is too long for a search snippet", page.Path)
	}
}

// TestStaticPages_AreProxiedToTheBackend guards a silent failure mode: these
// pages only get their own metadata if nginx actually forwards them here.
// Miss one in the location regex and nginx serves the static shell instead —
// the page keeps the homepage's canonical and quietly stays out of the index,
// with nothing failing to show for it.
func TestStaticPages_AreProxiedToTheBackend(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "frontend", "nginx.conf"))
	if err != nil {
		t.Skipf("nginx.conf not readable from this checkout: %v", err)
	}

	// The one `location ~ ^/(a|b|c)$ {` block listing fixed public pages.
	re := regexp.MustCompile(`location\s+~\s+\^/\(([a-z0-9|-]+)\)\$`)
	m := re.FindSubmatch(raw)
	if m == nil {
		t.Fatal("no fixed-public-page location block found in frontend/nginx.conf")
	}

	proxied := map[string]bool{}
	for _, name := range strings.Split(string(m[1]), "|") {
		proxied["/"+name] = true
	}

	for _, page := range StaticPages {
		assert.True(t, proxied[page.Path],
			"%s is in StaticPages but nginx does not proxy it to the backend", page.Path)
	}
	assert.Len(t, proxied, len(StaticPages),
		"nginx proxies a path that StaticPages does not define metadata for")
}
