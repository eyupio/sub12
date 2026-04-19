package handler

import (
	"net/http"
	"net/http/httptest"
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

	// Fallback: the embedded holding page must never be cached, otherwise the
	// in-page JS reload serves itself back from cache and the user is stuck on
	// "Continue to sub-12" until a manual navigation clears the entry.
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
		name    string
		header  string
		expect  string
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
	// "Getting things ready" as the canonical title. The inline reload must
	// also be the only retry mechanism — a <meta http-equiv="refresh"> would
	// combine with the JS reload and hammer the backend from every tab.
	assert.Contains(t, fallbackTemplate, `name="robots" content="noindex"`)
	assert.NotContains(t, fallbackTemplate, `http-equiv="refresh"`)
	assert.Contains(t, fallbackTemplate, "fallbackReloadDelay", "reload should back off across retries")
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
	// og:image:width was stripped because we can't guarantee the dimensions
	assert.NotContains(t, out, "og:image:width")
	// No duplicate og:title tags
	assert.Equal(t, 1, strings.Count(out, `property="og:title"`))
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

	assert.Contains(t, out, `property="og:profile:username" content="John Shooter"`)
	assert.Contains(t, out, `property="article:author" content="https://example.com/share/users/abc"`)
	assert.Contains(t, out, `property="og:image:alt" content="John Shooter — 245 points (12X) on sub-12"`)
	assert.Contains(t, out, `name="twitter:creator" content="John Shooter"`)
}

func TestInjectOG_OmitsAuthorWhenUnknown(t *testing.T) {
	tmpl := []byte(`<!doctype html>
<html>
  <head>
    <meta property="og:profile:username" content="stale" />
    <meta property="article:author" content="stale" />
    <meta property="og:image:alt" content="stale" />
    <meta name="twitter:creator" content="stale" />
  </head>
</html>`)
	og := openGraph{Title: "SUB12", Description: "…", Image: "/og.png", URL: "/", Type: "website"}

	out := string(injectOG(tmpl, og, "SUB12"))

	assert.NotContains(t, out, "stale")
	assert.NotContains(t, out, "og:profile:username")
	assert.NotContains(t, out, "article:author")
	assert.NotContains(t, out, "og:image:alt")
	assert.NotContains(t, out, "twitter:creator")
}

func newShareMetaForTest(frontendOrigin string, ttl time.Duration) *ShareMeta {
	return &ShareMeta{
		siteURL:        "https://example.com",
		siteName:       "SUB12",
		frontendOrigin: strings.TrimRight(frontendOrigin, "/"),
		log:            zerolog.Nop(),
		ttl:            ttl,
	}
}
