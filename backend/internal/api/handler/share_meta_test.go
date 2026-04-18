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

	got := scoreCardDescription(card, "John Shooter", rifle, pellet)

	assert.Contains(t, got, "John Shooter")
	assert.Contains(t, got, "245 (12X)")
	assert.Contains(t, got, "2026-04-18")
	assert.Contains(t, got, "Birmingham Club")
	assert.Contains(t, got, "Air Arms S510")
	assert.Contains(t, got, "JSB Exact 4.52mm")
	assert.Contains(t, got, "shared via sub-12")
}

func TestScoreCardDescription_MinimalCardDegrades(t *testing.T) {
	card := &model.ScoreCard{TotalScore: 200, XCount: 0}
	got := scoreCardDescription(card, "", nil, nil)

	assert.Contains(t, got, "200 (0X)")
	assert.Contains(t, got, "shared via sub-12")
	assert.NotContains(t, got, " • Birmingham")
}

func TestTruncate_HandlesRunes(t *testing.T) {
	assert.Equal(t, "abc", truncate("abc", 10))
	assert.Equal(t, "abcdefgh…", truncate("abcdefghij", 9))
	assert.Equal(t, "short", truncate("   short   ", 10))
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

func newShareMetaForTest(frontendOrigin string, ttl time.Duration) *ShareMeta {
	return &ShareMeta{
		siteURL:        "https://example.com",
		siteName:       "SUB12",
		frontendOrigin: strings.TrimRight(frontendOrigin, "/"),
		log:            zerolog.Nop(),
		ttl:            ttl,
	}
}
