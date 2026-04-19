package handler

import (
	"bytes"
	"container/list"
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/fogleman/gg"
	"github.com/go-chi/chi/v5"
	"github.com/golang/freetype/truetype"
	"github.com/rs/zerolog"
	"golang.org/x/image/font"
	"golang.org/x/image/font/gofont/gobold"
	"golang.org/x/image/font/gofont/goregular"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

// OGImage renders branded 1200×630 PNG previews for shareable entities.
// The rendered PNG is what social platforms embed in link previews. One
// endpoint per entity type; all share a common layout helper.
//
// Rendered images are cached in-memory keyed by {type, id, updatedAt}.
// Memory stays bounded by a simple FIFO eviction once we exceed the cap.
// Privacy rules mirror ShareMeta: private / unknown entities fall through
// to the site-wide /og-image.png.
type OGImage struct {
	scoreCards *service.ScoreCardService
	pelletTest *service.PelletTestService
	leagues    *service.LeagueService
	clubs      *service.ClubService
	users      *service.UserService
	rifles     *service.RifleService
	pellets    *service.PelletService
	log        zerolog.Logger

	regular *truetype.Font
	bold    *truetype.Font

	cache *ogCache
}

// NewOGImage constructs the handler. Parsing the embedded fonts up front
// means every request just hits the already-loaded TTF.
func NewOGImage(
	scoreCards *service.ScoreCardService,
	pelletTest *service.PelletTestService,
	leagues *service.LeagueService,
	clubs *service.ClubService,
	users *service.UserService,
	rifles *service.RifleService,
	pellets *service.PelletService,
	log zerolog.Logger,
) (*OGImage, error) {
	regular, err := truetype.Parse(goregular.TTF)
	if err != nil {
		return nil, fmt.Errorf("parse regular font: %w", err)
	}
	bold, err := truetype.Parse(gobold.TTF)
	if err != nil {
		return nil, fmt.Errorf("parse bold font: %w", err)
	}
	return &OGImage{
		scoreCards: scoreCards,
		pelletTest: pelletTest,
		leagues:    leagues,
		clubs:      clubs,
		users:      users,
		rifles:     rifles,
		pellets:    pellets,
		log:        log,
		regular:    regular,
		bold:       bold,
		cache:      newOGCache(256),
	}, nil
}

// ── HTTP handlers ───────────────────────────────────────────────────────────

func (h *OGImage) ScoreCard() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if id == "" {
			h.redirectDefault(w, r)
			return
		}
		card, err := h.scoreCards.GetForViewer(r.Context(), id, "")
		if err != nil {
			h.redirectDefault(w, r)
			return
		}

		key := ogCacheKey("score_card", id, card.UpdatedAt)
		if png, ok := h.cache.Get(key); ok {
			h.writePNG(w, png)
			return
		}

		displayName := h.lookupDisplayName(r.Context(), card.UserID)
		rifle := h.lookupRifle(r.Context(), card.RifleID, card.UserID)
		pellet := h.lookupPellet(r.Context(), card.PelletID, card.UserID)

		primary := fmt.Sprintf("%d", card.TotalScore)
		subprimary := ""
		if card.XCount > 0 {
			subprimary = fmt.Sprintf("%dX", card.XCount)
		}
		meta := scoreCardMetaLines(card, displayName, rifle, pellet)

		png, err := h.render("SCORE CARD", primary, subprimary, meta)
		if err != nil {
			h.log.Error().Err(err).Msg("og_image: render score card")
			h.redirectDefault(w, r)
			return
		}
		h.cache.Set(key, png)
		h.writePNG(w, png)
	}
}

func (h *OGImage) PelletTest() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if id == "" {
			h.redirectDefault(w, r)
			return
		}
		sess, err := h.pelletTest.GetForViewer(r.Context(), id, "")
		if err != nil {
			h.redirectDefault(w, r)
			return
		}

		key := ogCacheKey("pellet_test", id, sess.UpdatedAt)
		if png, ok := h.cache.Get(key); ok {
			h.writePNG(w, png)
			return
		}

		displayName := h.lookupDisplayName(r.Context(), sess.UserID)
		primary := pelletTestPrimary(sess)
		meta := pelletTestMetaLines(sess, displayName)

		png, err := h.render("PELLET TEST", primary, "", meta)
		if err != nil {
			h.log.Error().Err(err).Msg("og_image: render pellet test")
			h.redirectDefault(w, r)
			return
		}
		h.cache.Set(key, png)
		h.writePNG(w, png)
	}
}

func (h *OGImage) League() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if id == "" || h.leagues == nil {
			h.redirectDefault(w, r)
			return
		}
		league, err := h.leagues.GetByID(r.Context(), id, "")
		if err != nil || league == nil {
			h.redirectDefault(w, r)
			return
		}

		// Leagues don't expose UpdatedAt on the public shape; fall back to a
		// coarse hourly cache key instead of tying the rendered image to a
		// mutable ETag-ish value.
		key := ogCacheKey("league", id, time.Now().Truncate(time.Hour))
		if png, ok := h.cache.Get(key); ok {
			h.writePNG(w, png)
			return
		}

		primary := league.Name
		meta := leagueMetaLines(league)

		png, err := h.render("LEAGUE", primary, "", meta)
		if err != nil {
			h.log.Error().Err(err).Msg("og_image: render league")
			h.redirectDefault(w, r)
			return
		}
		h.cache.Set(key, png)
		h.writePNG(w, png)
	}
}

func (h *OGImage) Club() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if id == "" || h.clubs == nil {
			h.redirectDefault(w, r)
			return
		}
		club, err := h.clubs.GetByID(r.Context(), id, "")
		if err != nil || club == nil {
			h.redirectDefault(w, r)
			return
		}

		key := ogCacheKey("club", id, time.Now().Truncate(time.Hour))
		if png, ok := h.cache.Get(key); ok {
			h.writePNG(w, png)
			return
		}

		primary := club.Name
		meta := clubMetaLines(club)

		png, err := h.render("CLUB", primary, "", meta)
		if err != nil {
			h.log.Error().Err(err).Msg("og_image: render club")
			h.redirectDefault(w, r)
			return
		}
		h.cache.Set(key, png)
		h.writePNG(w, png)
	}
}

func (h *OGImage) User() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if id == "" || h.users == nil {
			h.redirectDefault(w, r)
			return
		}
		profile, err := h.users.GetPublicProfile(r.Context(), id)
		if err != nil || profile == nil || profile.ProfileVisibility == "private" {
			h.redirectDefault(w, r)
			return
		}

		key := ogCacheKey("user", id, time.Now().Truncate(time.Hour))
		if png, ok := h.cache.Get(key); ok {
			h.writePNG(w, png)
			return
		}

		primary := profile.DisplayName
		meta := userMetaLines(profile)

		png, err := h.render("PROFILE", primary, "", meta)
		if err != nil {
			h.log.Error().Err(err).Msg("og_image: render user")
			h.redirectDefault(w, r)
			return
		}
		h.cache.Set(key, png)
		h.writePNG(w, png)
	}
}

// ── shared rendering ────────────────────────────────────────────────────────

const (
	ogWidth       = 1200
	ogHeight      = 630
	bgColor       = "#0C0C0C"
	surfaceColor  = "#161513"
	brassColor    = "#C9A86A"
	textColor     = "#E7E4DE"
	mutedColor    = "#9A948A"
	dividerColor  = "#2A2824"
	maxMetaRunes  = 68
	wordmarkText  = "SUB12"
	wordmarkScale = 42
)

// render paints the shared OG layout and returns the PNG bytes.
//
// Layout, top-to-bottom: wordmark + type chip, hairline divider, primary
// value (big), optional sub-primary (e.g. "(12X)"), meta lines.
func (h *OGImage) render(typeLabel, primary, subprimary string, meta []string) ([]byte, error) {
	dc := gg.NewContext(ogWidth, ogHeight)
	dc.SetHexColor(bgColor)
	dc.Clear()

	// Brass hairline at the top — small visual anchor, keeps the brand cue
	// visible even when the preview is cropped by a social platform.
	dc.SetHexColor(brassColor)
	dc.DrawRectangle(0, 0, ogWidth, 4)
	dc.Fill()

	margin := 64.0

	// Wordmark
	dc.SetHexColor(textColor)
	if err := h.drawText(dc, wordmarkText, margin, 84, wordmarkScale, true); err != nil {
		return nil, err
	}

	// Type chip (right of wordmark, same baseline)
	dc.SetHexColor(brassColor)
	if err := h.drawText(dc, typeLabel, margin+170, 88, 20, true); err != nil {
		return nil, err
	}

	// Divider below the header
	dc.SetHexColor(dividerColor)
	dc.DrawRectangle(margin, 124, ogWidth-2*margin, 1)
	dc.Fill()

	// Primary value — huge, centred vertically in the upper 60% of the canvas.
	primarySize := primaryFontSize(primary)
	dc.SetHexColor(textColor)
	primaryY := 320.0
	if err := h.drawTextCentred(dc, primary, ogWidth/2, primaryY, primarySize, true); err != nil {
		return nil, err
	}

	// Sub-primary (e.g. "12X" for score cards)
	subY := primaryY + 64
	if subprimary != "" {
		dc.SetHexColor(brassColor)
		if err := h.drawTextCentred(dc, subprimary, ogWidth/2, subY, 42, true); err != nil {
			return nil, err
		}
	}

	// Meta lines — bottom of canvas
	metaY := 500.0
	lineHeight := 34.0
	dc.SetHexColor(mutedColor)
	for i, line := range meta {
		if i >= 2 {
			break
		}
		if line == "" {
			continue
		}
		if err := h.drawTextCentred(dc, truncateRunes(line, maxMetaRunes), ogWidth/2, metaY+float64(i)*lineHeight, 22, false); err != nil {
			return nil, err
		}
	}

	// Bottom rule matching the top accent
	dc.SetHexColor(brassColor)
	dc.DrawRectangle(0, ogHeight-4, ogWidth, 4)
	dc.Fill()

	var buf bytes.Buffer
	if err := dc.EncodePNG(&buf); err != nil {
		return nil, fmt.Errorf("encode png: %w", err)
	}
	return buf.Bytes(), nil
}

func (h *OGImage) drawText(dc *gg.Context, text string, x, y, size float64, bold bool) error {
	face := h.face(size, bold)
	dc.SetFontFace(face)
	dc.DrawStringAnchored(text, x, y, 0, 0)
	return nil
}

func (h *OGImage) drawTextCentred(dc *gg.Context, text string, x, y, size float64, bold bool) error {
	face := h.face(size, bold)
	dc.SetFontFace(face)
	dc.DrawStringAnchored(text, x, y, 0.5, 0.5)
	return nil
}

func (h *OGImage) face(size float64, bold bool) font.Face {
	f := h.regular
	if bold {
		f = h.bold
	}
	return truetype.NewFace(f, &truetype.Options{Size: size})
}

// primaryFontSize scales the headline down for longer strings so wide names
// (club/league/user) don't overflow the 1200px canvas.
func primaryFontSize(primary string) float64 {
	runes := len([]rune(primary))
	switch {
	case runes <= 4:
		return 220
	case runes <= 8:
		return 160
	case runes <= 14:
		return 110
	case runes <= 22:
		return 78
	case runes <= 34:
		return 58
	default:
		return 46
	}
}

func (h *OGImage) writePNG(w http.ResponseWriter, png []byte) {
	w.Header().Set("Content-Type", "image/png")
	// 10-minute cache with a short stale-while-revalidate window. Social
	// platforms and CDNs re-request the PNG at their own cadence; we bound how
	// long a previously-public entity can linger as a rich preview if the
	// owner flips visibility. Shorter than the 1h we used to use, longer than
	// a humans-only render would need, and paired with no-store on the 302
	// below so a flipped-to-private entity clears from edge caches promptly.
	w.Header().Set("Cache-Control", "public, max-age=600, stale-while-revalidate=60")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(png)
}

func (h *OGImage) redirectDefault(w http.ResponseWriter, r *http.Request) {
	// Don't let CDNs or browsers cache the fallback redirect: if a card later
	// becomes public again we want the next request to render the real PNG,
	// not a stuck 302 pointing at the generic site image.
	w.Header().Set("Cache-Control", "no-store")
	http.Redirect(w, r, "/og-image.png", http.StatusFound)
}

// ── shared lookups (mirror of ShareMeta helpers) ────────────────────────────

func (h *OGImage) lookupDisplayName(ctx context.Context, userID string) string {
	if h.users == nil || userID == "" {
		return ""
	}
	profile, err := h.users.GetPublicProfile(ctx, userID)
	if err != nil || profile == nil || profile.ProfileVisibility == "private" {
		return ""
	}
	return profile.DisplayName
}

func (h *OGImage) lookupRifle(ctx context.Context, rifleID *string, ownerID string) *model.Rifle {
	if h.rifles == nil || rifleID == nil || *rifleID == "" || ownerID == "" {
		return nil
	}
	rifle, err := h.rifles.GetByID(ctx, *rifleID, ownerID)
	if err != nil {
		return nil
	}
	return rifle
}

func (h *OGImage) lookupPellet(ctx context.Context, pelletID *string, ownerID string) *model.Pellet {
	if h.pellets == nil || pelletID == nil || *pelletID == "" || ownerID == "" {
		return nil
	}
	pellet, err := h.pellets.GetByID(ctx, *pelletID, ownerID)
	if err != nil {
		return nil
	}
	return pellet
}

// ── per-type meta line builders ─────────────────────────────────────────────

func scoreCardMetaLines(card *model.ScoreCard, displayName string, rifle *model.Rifle, pellet *model.Pellet) []string {
	line1Parts := []string{}
	if displayName != "" {
		line1Parts = append(line1Parts, displayName)
	}
	if card.ShotAt != "" {
		line1Parts = append(line1Parts, card.ShotAt)
	}
	if card.Location != nil && *card.Location != "" {
		line1Parts = append(line1Parts, *card.Location)
	}
	line2Parts := []string{}
	if rifle != nil {
		r := strings.TrimSpace(rifle.Make + " " + rifle.Model)
		if r != "" {
			line2Parts = append(line2Parts, r)
		}
	}
	if pellet != nil {
		p := strings.TrimSpace(pellet.Brand + " " + pellet.Model)
		if p != "" {
			line2Parts = append(line2Parts, p)
		}
	}
	return []string{
		strings.Join(line1Parts, " · "),
		strings.Join(line2Parts, " + "),
	}
}

func pelletTestPrimary(sess *model.PelletTestSession) string {
	if sess.Pellet != nil {
		label := strings.TrimSpace(sess.Pellet.Brand + " " + sess.Pellet.Model)
		if label != "" {
			return label
		}
	}
	return "Pellet test"
}

func pelletTestMetaLines(sess *model.PelletTestSession, displayName string) []string {
	line1Parts := []string{}
	if displayName != "" {
		line1Parts = append(line1Parts, displayName)
	}
	if sess.Rifle != nil {
		r := strings.TrimSpace(sess.Rifle.Make + " " + sess.Rifle.Model)
		if r != "" {
			line1Parts = append(line1Parts, r)
		}
	}
	line2Parts := []string{}
	if sess.BestGroupSizeMM != nil {
		line2Parts = append(line2Parts, fmt.Sprintf("Best %.2fmm", *sess.BestGroupSizeMM))
	}
	if sess.AverageGroupSizeMM != nil {
		line2Parts = append(line2Parts, fmt.Sprintf("Avg %.2fmm", *sess.AverageGroupSizeMM))
	}
	if sess.DistanceM > 0 {
		line2Parts = append(line2Parts, fmt.Sprintf("%.1fm", sess.DistanceM))
	}
	if sess.TestDate != "" {
		line2Parts = append(line2Parts, sess.TestDate)
	}
	return []string{
		strings.Join(line1Parts, " · "),
		strings.Join(line2Parts, " · "),
	}
}

func leagueMetaLines(league *model.League) []string {
	line1 := fmt.Sprintf("%d member%s", league.MemberCount, plural(league.MemberCount))
	line2 := ""
	if league.Description != nil && strings.TrimSpace(*league.Description) != "" {
		line2 = truncateRunes(*league.Description, maxMetaRunes)
	}
	return []string{line1, line2}
}

func clubMetaLines(club *model.Club) []string {
	line1 := fmt.Sprintf("%d member%s", club.MemberCount, plural(club.MemberCount))
	line2 := ""
	if club.Description != nil && strings.TrimSpace(*club.Description) != "" {
		line2 = truncateRunes(*club.Description, maxMetaRunes)
	}
	return []string{line1, line2}
}

func userMetaLines(profile *model.PublicProfile) []string {
	line1Parts := []string{}
	if profile.Location != nil && *profile.Location != "" {
		line1Parts = append(line1Parts, *profile.Location)
	}
	if profile.Club != nil && *profile.Club != "" {
		line1Parts = append(line1Parts, *profile.Club)
	}
	line2 := ""
	if profile.Bio != nil && strings.TrimSpace(*profile.Bio) != "" {
		line2 = truncateRunes(*profile.Bio, maxMetaRunes)
	}
	return []string{strings.Join(line1Parts, " · "), line2}
}

func truncateRunes(s string, n int) string {
	s = strings.TrimSpace(s)
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return strings.TrimRight(string(runes[:n-1]), " ") + "…"
}

// ── cache ───────────────────────────────────────────────────────────────────

type ogCache struct {
	mu    sync.Mutex
	items map[string]*list.Element
	order *list.List
	cap   int
}

type ogCacheEntry struct {
	key  string
	data []byte
}

func newOGCache(capacity int) *ogCache {
	if capacity <= 0 {
		capacity = 64
	}
	return &ogCache{
		items: make(map[string]*list.Element, capacity),
		order: list.New(),
		cap:   capacity,
	}
}

func (c *ogCache) Get(key string) ([]byte, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	el, ok := c.items[key]
	if !ok {
		return nil, false
	}
	c.order.MoveToFront(el)
	return el.Value.(*ogCacheEntry).data, true
}

func (c *ogCache) Set(key string, data []byte) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if el, ok := c.items[key]; ok {
		c.order.MoveToFront(el)
		el.Value.(*ogCacheEntry).data = data
		return
	}
	el := c.order.PushFront(&ogCacheEntry{key: key, data: data})
	c.items[key] = el
	for c.order.Len() > c.cap {
		oldest := c.order.Back()
		if oldest == nil {
			break
		}
		c.order.Remove(oldest)
		delete(c.items, oldest.Value.(*ogCacheEntry).key)
	}
}

func ogCacheKey(kind, id string, version any) string {
	return fmt.Sprintf("%s|%s|%v", kind, id, version)
}
