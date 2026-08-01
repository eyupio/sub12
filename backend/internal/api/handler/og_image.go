package handler

import (
	"bytes"
	"container/list"
	"context"
	"fmt"
	"image/color"
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
		league, err := h.leagues.GetByID(r.Context(), id, "", "")
		if err != nil || league == nil {
			h.redirectDefault(w, r)
			return
		}

		// Leagues don't expose UpdatedAt on the public shape; fall back to a
		// coarse hourly cache key instead of tying the rendered image to a
		// mutable ETag-ish value. Keyed on the resolved ID so the slug and
		// UUID spellings of the URL share one rendered PNG.
		key := ogCacheKey("league", league.ID, time.Now().Truncate(time.Hour))
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
		club, err := h.clubs.GetByID(r.Context(), id, "", "")
		if err != nil || club == nil {
			h.redirectDefault(w, r)
			return
		}

		key := ogCacheKey("club", club.ID, time.Now().Truncate(time.Hour))
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

		key := ogCacheKey("user", profile.ID, time.Now().Truncate(time.Hour))
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
	ogWidth  = 1200
	ogHeight = 630

	// Horizontal centre of the canvas. The whole composition is built around
	// it — see ogSafeHalfWidth for why.
	ogCentreX = ogWidth / 2.0

	brassColor    = "#B8741F"
	brassInkColor = "#FBF6E9"
	textColor     = "#2A1F12"
	mutedColor    = "#5A4632"
	ruleColor     = "#C9B48C"

	maxMetaRunes = 68

	wordmarkSUB = "SUB"
	wordmark12  = "12"
	taglineText = "PRECISION SHOOTING, PROPERLY TRACKED."
	siteText    = "SUB12.IO"

	// Not every surface honours the 1.91:1 aspect an OG image declares.
	// WhatsApp, Slack, Discord, iMessage and the Facebook mobile composer
	// centre-crop towards a square, which on a 1200×630 canvas keeps only
	// x ∈ [285, 915]. Anything the preview must still read — wordmark,
	// tagline, eyebrow, footer URL — is kept inside this half-width of the
	// centre so those crops stay legible instead of slicing "SUB12" to "B12".
	ogSafeHalfWidth = 300.0

	// Headline column. Deliberately a little wider than the square-safe zone:
	// long league and club names would otherwise shrink to an unreadable size
	// in the common 1.91:1 case to protect a crop most shares never hit. The
	// brand furniture around it stays inside ogSafeHalfWidth regardless, so a
	// square crop still lands on a recognisably SUB12 card.
	ogPrimaryMaxWidth = 720.0
	ogMetaMaxWidth    = 880.0

	// Vertical band the entity block is centred within. Vertical position is
	// unaffected by centre-cropping, so this needs no safe-zone allowance.
	ogBlockTop    = 198.0
	ogBlockBottom = 524.0
)

var (
	bgCentreRGBA = color.RGBA{R: 0xF6, G: 0xEF, B: 0xDC, A: 0xFF}
	bgEdgeRGBA   = color.RGBA{R: 0xE4, G: 0xD7, B: 0xBA, A: 0xFF}
)

// render paints the shared OG layout and returns the PNG bytes.
//
// The composition is a single centred column: brand lockup and tagline at the
// top, the entity block (eyebrow, headline, optional sub-primary pill, meta
// lines) centred in the middle band, and the site URL in the footer. Brass
// rules run the full width at top and bottom so the card is identifiably
// SUB12 even when a platform crops the sides away.
func (h *OGImage) render(typeLabel, primary, subprimary string, meta []string) ([]byte, error) {
	dc := gg.NewContext(ogWidth, ogHeight)

	h.drawBackground(dc)
	h.drawFlankTargets(dc, 118, 315)
	h.drawFlankTargets(dc, ogWidth-118, 315)
	h.drawBrandHeader(dc)
	h.drawEntityBlock(dc, typeLabel, primary, subprimary, meta)
	h.drawFooter(dc)

	var buf bytes.Buffer
	if err := dc.EncodePNG(&buf); err != nil {
		return nil, fmt.Errorf("encode png: %w", err)
	}
	return buf.Bytes(), nil
}

// drawBackground lays the cream paper plus the full-bleed brass rules. The
// radial wash keeps the centre — where the content sits — a shade lighter
// than the edges so the card has some depth in a busy feed.
func (h *OGImage) drawBackground(dc *gg.Context) {
	wash := gg.NewRadialGradient(ogCentreX, 300, 0, ogCentreX, 300, 780)
	wash.AddColorStop(0, bgCentreRGBA)
	wash.AddColorStop(1, bgEdgeRGBA)
	dc.SetFillStyle(wash)
	dc.DrawRectangle(0, 0, ogWidth, ogHeight)
	dc.Fill()

	dc.SetHexColor(brassColor)
	dc.DrawRectangle(0, 0, ogWidth, 10)
	dc.Fill()
	dc.DrawRectangle(0, ogHeight-10, ogWidth, 10)
	dc.Fill()
}

// drawFlankTargets paints the 5×5 target motif in the outer margins. Purely
// decorative brand texture: it sits outside the headline column and is the
// first thing a centre crop discards, by design.
func (h *OGImage) drawFlankTargets(dc *gg.Context, cx, cy float64) {
	const gap, radius = 34.0, 11.0
	hits := map[int]bool{6: true, 12: true, 18: true}
	offset := -2.0 * gap
	for row := 0; row < 5; row++ {
		for col := 0; col < 5; col++ {
			x := cx + offset + float64(col)*gap
			y := cy + offset + float64(row)*gap
			if hits[row*5+col] {
				dc.SetRGBA(184.0/255.0, 116.0/255.0, 31.0/255.0, 0.55)
				dc.SetLineWidth(2.2)
				dc.DrawCircle(x, y, radius)
				dc.Stroke()
				dc.DrawCircle(x, y, 3.4)
				dc.Fill()
				continue
			}
			dc.SetRGBA(63.0/255.0, 45.0/255.0, 30.0/255.0, 0.22)
			dc.SetLineWidth(1.3)
			dc.DrawCircle(x, y, radius)
			dc.Stroke()
			dc.DrawCircle(x, y, 2.2)
			dc.Fill()
		}
	}
}

func (h *OGImage) drawBrandHeader(dc *gg.Context) {
	h.drawWordmark(dc, ogCentreX, 84, 66)
	dc.SetHexColor(mutedColor)
	h.drawTrackedCentred(dc, taglineText, ogCentreX, 140, 17, false, 3.4)
	dc.SetHexColor(brassColor)
	dc.DrawRectangle(ogCentreX-44, 170, 88, 3)
	dc.Fill()
}

func (h *OGImage) drawFooter(dc *gg.Context) {
	dc.SetHexColor(ruleColor)
	dc.SetLineWidth(1.5)
	dc.DrawLine(ogCentreX-ogSafeHalfWidth, 556, ogCentreX+ogSafeHalfWidth, 556)
	dc.Stroke()
	dc.SetHexColor(brassColor)
	h.drawTrackedCentred(dc, siteText, ogCentreX, 590, 21, true, 7)
}

// drawWordmark paints "SUB12" as one baseline-aligned lockup centred on cx,
// with the numerals set smaller and in brass to match the brand mark.
func (h *OGImage) drawWordmark(dc *gg.Context, cx, cy, size float64) {
	wordFace := h.face(size, true)
	numFace := h.face(size*0.62, true)

	dc.SetFontFace(wordFace)
	wordWidth, _ := dc.MeasureString(wordmarkSUB)
	dc.SetFontFace(numFace)
	numWidth, _ := dc.MeasureString(wordmark12)

	gap := size * 0.03
	baseline := cy + capHeightOf(wordFace)/2
	x := cx - (wordWidth+gap+numWidth)/2

	dc.SetFontFace(wordFace)
	dc.SetHexColor(textColor)
	dc.DrawString(wordmarkSUB, x, baseline)
	dc.SetFontFace(numFace)
	dc.SetHexColor(brassColor)
	dc.DrawString(wordmark12, x+wordWidth+gap, baseline)
}

// drawEntityBlock stacks the per-entity content — eyebrow, headline lines,
// optional sub-primary pill, meta lines — and centres the whole stack in the
// middle band. Measuring the stack before drawing is what keeps a two-line
// league name from colliding with the meta lines below it, which the previous
// fixed-baseline layout could not guarantee.
func (h *OGImage) drawEntityBlock(dc *gg.Context, typeLabel, primary, subprimary string, meta []string) {
	type item struct {
		draw     func(cy float64)
		height   float64
		gapAbove float64
	}
	items := make([]item, 0, 6)

	if typeLabel != "" {
		label := typeLabel
		items = append(items, item{
			height: capHeightOf(h.face(23, true)),
			draw: func(cy float64) {
				dc.SetHexColor(brassColor)
				h.drawTrackedCentred(dc, label, ogCentreX, cy, 23, true, 6.5)
			},
		})
	}

	lines, primarySize := h.layoutPrimary(dc, primary)
	for i, line := range lines {
		text := line
		gap := 36.0
		if i > 0 {
			gap = primarySize * 0.28
		}
		items = append(items, item{
			height:   capHeightOf(h.face(primarySize, true)),
			gapAbove: gap,
			draw: func(cy float64) {
				dc.SetHexColor(textColor)
				h.drawFittedCentred(dc, text, ogCentreX, cy, primarySize, ogPrimaryMaxWidth, true)
			},
		})
	}

	if subprimary != "" {
		text := subprimary
		items = append(items, item{
			height:   52,
			gapAbove: 28,
			draw:     func(cy float64) { h.drawPill(dc, text, ogCentreX, cy) },
		})
	}

	for i, line := range metaLines(meta) {
		text := line
		gap := 16.0
		if i == 0 {
			gap = 38.0
		}
		items = append(items, item{
			height:   capHeightOf(h.face(23, false)),
			gapAbove: gap,
			draw: func(cy float64) {
				dc.SetHexColor(mutedColor)
				h.drawFittedCentred(dc, text, ogCentreX, cy, 23, ogMetaMaxWidth, false)
			},
		})
	}

	if len(items) == 0 {
		return
	}
	items[0].gapAbove = 0

	total := 0.0
	for _, it := range items {
		total += it.gapAbove + it.height
	}

	y := (ogBlockTop+ogBlockBottom)/2 - total/2
	for _, it := range items {
		y += it.gapAbove
		it.draw(y + it.height/2)
		y += it.height
	}
}

// drawPill paints a filled brass lozenge — used for the X-count, which reads
// as a badge under the score rather than a number floating beside it.
func (h *OGImage) drawPill(dc *gg.Context, text string, cx, cy float64) {
	const size, height = 30.0, 52.0
	width := h.trackedWidth(dc, text, size, true, 2) + 56
	dc.SetHexColor(brassColor)
	dc.DrawRoundedRectangle(cx-width/2, cy-height/2, width, height, height/2)
	dc.Fill()
	dc.SetHexColor(brassInkColor)
	h.drawTrackedCentred(dc, text, cx, cy, size, true, 2)
}

// metaLines trims, truncates and caps the supporting lines at two.
func metaLines(meta []string) []string {
	out := make([]string, 0, 2)
	for _, line := range meta {
		if strings.TrimSpace(line) == "" {
			continue
		}
		out = append(out, truncateRunes(line, maxMetaRunes))
		if len(out) == 2 {
			break
		}
	}
	return out
}

// ── text primitives ─────────────────────────────────────────────────────────
//
// Everything is drawn from a *visual centre* rather than a baseline. gg's
// DrawStringAnchored centres on the font's full line height, which leaves
// text sitting visibly low; centring on cap height is what the eye reads as
// centred, and it makes the stack maths in drawEntityBlock exact.

// capHeightOf measures a capital's ink height. font.Face.Metrics().CapHeight
// is not populated by the truetype faces we build here, so the glyph bounds
// are the reliable source.
func capHeightOf(face font.Face) float64 {
	bounds, _ := font.BoundString(face, "H")
	return float64(-bounds.Min.Y) / 64
}

func (h *OGImage) drawCentred(dc *gg.Context, text string, cx, cy, size float64, bold bool) {
	face := h.face(size, bold)
	dc.SetFontFace(face)
	width, _ := dc.MeasureString(text)
	dc.DrawString(text, cx-width/2, cy+capHeightOf(face)/2)
}

// drawFittedCentred shrinks the text a point at a time until it fits maxWidth.
// The backstop for anything layoutPrimary could not wrap — a single
// unbreakable word longer than the column, for instance.
func (h *OGImage) drawFittedCentred(dc *gg.Context, text string, cx, cy, size, maxWidth float64, bold bool) {
	for size > 14 {
		dc.SetFontFace(h.face(size, bold))
		if width, _ := dc.MeasureString(text); width <= maxWidth {
			break
		}
		size--
	}
	h.drawCentred(dc, text, cx, cy, size, bold)
}

// drawTrackedCentred draws letter-spaced text. Used for the uppercase eyebrow,
// tagline and footer URL, where tracking is what separates a set wordmark from
// a run of capitals. Drawing rune by rune drops kerning, which is what you
// want for tracked capitals anyway.
func (h *OGImage) drawTrackedCentred(dc *gg.Context, text string, cx, cy, size float64, bold bool, tracking float64) {
	face := h.face(size, bold)
	x := cx - h.trackedWidth(dc, text, size, bold, tracking)/2
	dc.SetFontFace(face)
	baseline := cy + capHeightOf(face)/2
	for _, r := range text {
		s := string(r)
		dc.DrawString(s, x, baseline)
		width, _ := dc.MeasureString(s)
		x += width + tracking
	}
}

func (h *OGImage) trackedWidth(dc *gg.Context, text string, size float64, bold bool, tracking float64) float64 {
	dc.SetFontFace(h.face(size, bold))
	runes := []rune(text)
	total := 0.0
	for i, r := range runes {
		width, _ := dc.MeasureString(string(r))
		total += width
		if i < len(runes)-1 {
			total += tracking
		}
	}
	return total
}

func (h *OGImage) face(size float64, bold bool) font.Face {
	f := h.regular
	if bold {
		f = h.bold
	}
	return truetype.NewFace(f, &truetype.Options{Size: size})
}

// layoutPrimary picks a headline size and line break-up. It prefers one large
// line, falls back to two lines rather than shrinking indefinitely — two lines
// at 90pt read far better in a feed than one line at 46pt, which is where the
// old shrink-only ladder ended up for long league and club names.
func (h *OGImage) layoutPrimary(dc *gg.Context, primary string) ([]string, float64) {
	primary = strings.Join(strings.Fields(primary), " ")
	if primary == "" {
		return nil, 0
	}

	start := primaryStartSize(primary)
	for size := start; size >= 64; size -= 3 {
		dc.SetFontFace(h.face(size, true))
		if width, _ := dc.MeasureString(primary); width <= ogPrimaryMaxWidth {
			return []string{primary}, size
		}
	}
	for size := start; size >= 44; size -= 3 {
		if lines, ok := h.wrapLines(dc, primary, size, ogPrimaryMaxWidth, 2); ok {
			return lines, size
		}
	}
	// Nothing fits two lines even at the floor size. Clip and let
	// drawFittedCentred shrink whatever is left the rest of the way.
	clipped := truncateRunes(primary, 56)
	if lines, ok := h.wrapLines(dc, clipped, 44, ogPrimaryMaxWidth, 2); ok {
		return lines, 44
	}
	return []string{clipped}, 44
}

// wrapLines greedily breaks text on word boundaries, reporting false when the
// result needs more than maxLines or when a single word still overflows.
func (h *OGImage) wrapLines(dc *gg.Context, text string, size, maxWidth float64, maxLines int) ([]string, bool) {
	dc.SetFontFace(h.face(size, true))
	words := strings.Fields(text)
	if len(words) == 0 {
		return nil, false
	}

	lines := make([]string, 0, maxLines+1)
	current := words[0]
	for _, word := range words[1:] {
		candidate := current + " " + word
		if width, _ := dc.MeasureString(candidate); width <= maxWidth {
			current = candidate
			continue
		}
		lines = append(lines, current)
		current = word
	}
	lines = append(lines, current)

	if len(lines) > maxLines {
		return nil, false
	}
	for _, line := range lines {
		if width, _ := dc.MeasureString(line); width > maxWidth {
			return nil, false
		}
	}
	return lines, true
}

// primaryStartSize caps the headline by length so a short score stays huge
// without a long name starting from a size it can never reach.
func primaryStartSize(primary string) float64 {
	switch runes := len([]rune(primary)); {
	case runes <= 4:
		return 184
	case runes <= 8:
		return 148
	case runes <= 14:
		return 112
	default:
		return 92
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
