package handler

import (
	"errors"
	"fmt"
	"html/template"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/service"
)

// ShareHandler renders public, crawler-friendly HTML pages with per-entity
// Open Graph + Twitter Card meta tags. Human visitors are redirected to the
// corresponding SPA route after the bot has finished parsing.
type ShareHandler struct {
	cards        *service.ScoreCardService
	pelletTests  *service.PelletTestService
	users        *service.UserService
	leagues      *service.LeagueService
	clubs        *service.ClubService
	achievements *service.AchievementService
	appURL       string
}

func NewShare(
	cards *service.ScoreCardService,
	pelletTests *service.PelletTestService,
	users *service.UserService,
	leagues *service.LeagueService,
	clubs *service.ClubService,
	achievements *service.AchievementService,
	appURL string,
) *ShareHandler {
	return &ShareHandler{
		cards:        cards,
		pelletTests:  pelletTests,
		users:        users,
		leagues:      leagues,
		clubs:        clubs,
		achievements: achievements,
		appURL:       strings.TrimRight(appURL, "/"),
	}
}

type shareMeta struct {
	Title       string
	Description string
	Image       string
	URL         string
	Canonical   string
	Type        string // og:type
	SiteName    string
}

const shareTemplateStr = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{.Title}}</title>
<meta name="description" content="{{.Description}}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="{{.Canonical}}">

<!-- Open Graph -->
<meta property="og:site_name" content="{{.SiteName}}">
<meta property="og:type" content="{{.Type}}">
<meta property="og:title" content="{{.Title}}">
<meta property="og:description" content="{{.Description}}">
<meta property="og:url" content="{{.URL}}">
<meta property="og:image" content="{{.Image}}">
<meta property="og:image:alt" content="{{.Title}}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{{.Title}}">
<meta name="twitter:description" content="{{.Description}}">
<meta name="twitter:image" content="{{.Image}}">

<!-- Redirect humans to the SPA after crawlers have parsed the meta tags. -->
<meta http-equiv="refresh" content="0; url={{.Canonical}}">
<script>window.location.replace({{.CanonicalJS}});</script>
</head>
<body>
<p>Redirecting to <a href="{{.Canonical}}">{{.Canonical}}</a>…</p>
</body>
</html>
`

// shareTemplate carries an extra CanonicalJS field so the JS assignment is
// safely escaped for JavaScript context (the HTML tag attribute uses standard
// HTML escaping).
var shareTemplate = template.Must(template.New("share").Parse(shareTemplateStr))

func (h *ShareHandler) render(w http.ResponseWriter, m shareMeta) {
	if m.SiteName == "" {
		m.SiteName = "sub-12"
	}
	if m.Type == "" {
		m.Type = "website"
	}
	if m.Image == "" {
		m.Image = h.appURL + "/og-image.png"
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=300")

	data := struct {
		shareMeta
		CanonicalJS template.JS
	}{
		shareMeta:   m,
		CanonicalJS: template.JS(jsonString(m.Canonical)),
	}
	_ = shareTemplate.Execute(w, data)
}

// jsonString returns a JSON-escaped, double-quoted string literal suitable
// for embedding in a JavaScript expression.
func jsonString(s string) string {
	b := make([]byte, 0, len(s)+2)
	b = append(b, '"')
	for _, r := range s {
		switch r {
		case '\\', '"':
			b = append(b, '\\', byte(r))
		case '\n':
			b = append(b, '\\', 'n')
		case '\r':
			b = append(b, '\\', 'r')
		case '\t':
			b = append(b, '\\', 't')
		case '<', '>', '&':
			b = append(b, []byte(fmt.Sprintf("\\u%04x", r))...)
		default:
			if r < 0x20 {
				b = append(b, []byte(fmt.Sprintf("\\u%04x", r))...)
			} else {
				b = append(b, []byte(string(r))...)
			}
		}
	}
	b = append(b, '"')
	return string(b)
}

func (h *ShareHandler) imageURLOrDefault(imageID *string) string {
	if imageID == nil || *imageID == "" {
		return h.appURL + "/og-image.png"
	}
	return fmt.Sprintf("%s/api/v1/images/%s", h.appURL, *imageID)
}

func (h *ShareHandler) genericCard(w http.ResponseWriter, r *http.Request, title, desc string) {
	h.render(w, shareMeta{
		Title:       title,
		Description: desc,
		Canonical:   h.appURL + "/app",
		URL:         h.appURL + r.URL.Path,
		Type:        "website",
	})
}

// GET /share/score-cards/{id}
func (h *ShareHandler) ScoreCard(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	card, err := h.cards.GetPublicByID(r.Context(), id)
	if err != nil || card == nil {
		h.genericCard(w, r, "Score card · sub-12",
			"Target-shooting score cards, leagues, and pellet testing on sub-12.")
		return
	}

	displayName := "A sub-12 shooter"
	if owner, err := h.users.GetPublicProfile(r.Context(), card.UserID); err == nil && owner != nil && owner.DisplayName != "" {
		displayName = owner.DisplayName
	}

	title := fmt.Sprintf("%s shot %d/250 with %dx · sub-12", displayName, card.TotalScore, card.XCount)
	desc := fmt.Sprintf("25-shot score card on %s — total %d, %d X's.", card.ShotAt, card.TotalScore, card.XCount)
	if card.Location != nil && *card.Location != "" {
		desc = fmt.Sprintf("%s Shot at %s.", desc, *card.Location)
	}

	image := h.imageURLOrDefault(card.CardImageURL)

	h.render(w, shareMeta{
		Title:       title,
		Description: desc,
		Image:       image,
		Canonical:   fmt.Sprintf("%s/app/scores/%s", h.appURL, card.ID),
		URL:         h.appURL + r.URL.Path,
		Type:        "article",
	})
}

// GET /share/pellet-tests/{id}
func (h *ShareHandler) PelletTest(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	session, err := h.pelletTests.GetPublicByID(r.Context(), id)
	if err != nil || session == nil {
		h.genericCard(w, r, "Pellet test · sub-12",
			"Precision pellet testing results with image-based group measurement on sub-12.")
		return
	}
	if !session.IsPublic {
		h.genericCard(w, r, "Private pellet test · sub-12",
			"This pellet test is private. Sign in to request access.")
		return
	}

	displayName := "A sub-12 shooter"
	if owner, err := h.users.GetPublicProfile(r.Context(), session.UserID); err == nil && owner != nil && owner.DisplayName != "" {
		displayName = owner.DisplayName
	}

	title := fmt.Sprintf("%s's pellet test · sub-12", displayName)
	desc := fmt.Sprintf("Pellet test on %s at %.0fm.", session.TestDate, session.DistanceM)
	if session.BestGroupSizeMM != nil {
		desc = fmt.Sprintf("%s Best group: %.2f mm.", desc, *session.BestGroupSizeMM)
	}
	if session.AverageGroupSizeMM != nil {
		desc = fmt.Sprintf("%s Avg group: %.2f mm.", desc, *session.AverageGroupSizeMM)
	}

	h.render(w, shareMeta{
		Title:       title,
		Description: desc,
		Canonical:   fmt.Sprintf("%s/app/pellet-testing/%s", h.appURL, session.ID),
		URL:         h.appURL + r.URL.Path,
		Type:        "article",
	})
}

// GET /share/users/{id}
func (h *ShareHandler) User(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	profile, err := h.users.GetPublicProfile(r.Context(), id)
	if err != nil || profile == nil {
		h.genericCard(w, r, "Shooter · sub-12",
			"Shooter profiles and scoreboards on sub-12.")
		return
	}
	if profile.ProfileVisibility == "private" {
		h.genericCard(w, r, "Private profile · sub-12",
			"This shooter's profile is private. Sign in to follow them on sub-12.")
		return
	}

	title := fmt.Sprintf("%s on sub-12", profile.DisplayName)
	desc := "Target-shooting profile on sub-12."
	if profile.Bio != nil && *profile.Bio != "" {
		desc = *profile.Bio
	} else if profile.Club != nil && *profile.Club != "" {
		desc = fmt.Sprintf("Shooter at %s.", *profile.Club)
	}

	h.render(w, shareMeta{
		Title:       title,
		Description: desc,
		Image:       h.imageURLOrDefault(profile.AvatarURL),
		Canonical:   fmt.Sprintf("%s/app/users/%s", h.appURL, profile.ID),
		URL:         h.appURL + r.URL.Path,
		Type:        "profile",
	})
}

// GET /share/users/{id}/achievements/{key}
func (h *ShareHandler) Achievement(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	key := chi.URLParam(r, "key")

	profile, _ := h.users.GetPublicProfile(r.Context(), userID)

	displayName := "A sub-12 shooter"
	if profile != nil && profile.DisplayName != "" {
		displayName = profile.DisplayName
	}

	var def *model.AchievementDef
	if defs, err := h.achievements.ListDefs(r.Context()); err == nil {
		for _, d := range defs {
			if d.ID == key {
				def = d
				break
			}
		}
	}

	title := fmt.Sprintf("%s unlocked an achievement · sub-12", displayName)
	desc := "Milestones and badges earned on sub-12."
	if def != nil {
		title = fmt.Sprintf("%s unlocked \"%s\" · sub-12", displayName, def.Name)
		if def.Description != "" {
			desc = def.Description
		}
	}

	canonical := fmt.Sprintf("%s/app/users/%s", h.appURL, userID)
	h.render(w, shareMeta{
		Title:       title,
		Description: desc,
		Canonical:   canonical,
		URL:         h.appURL + r.URL.Path,
		Type:        "article",
	})
}

// GET /share/leagues/{id}
func (h *ShareHandler) League(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Prefer the full league (when public) for a richer card; fall back to
	// the public summary, then to a generic card.
	league, err := h.leagues.GetByID(r.Context(), id, "")
	if err != nil && !errors.Is(err, service.ErrLeagueNotFound) {
		h.genericCard(w, r, "League · sub-12",
			"Target-shooting leagues and seasons on sub-12.")
		return
	}

	if league != nil {
		desc := fmt.Sprintf("%d member league on sub-12.", league.MemberCount)
		if league.Description != nil && *league.Description != "" {
			desc = *league.Description
		}
		h.render(w, shareMeta{
			Title:       fmt.Sprintf("%s · sub-12 league", league.Name),
			Description: desc,
			Image:       h.imageURLOrDefault(league.ImageURL),
			Canonical:   fmt.Sprintf("%s/app/leagues/%s", h.appURL, league.ID),
			URL:         h.appURL + r.URL.Path,
			Type:        "article",
		})
		return
	}

	if sum, err := h.leagues.SummaryByID(r.Context(), id); err == nil && sum != nil {
		desc := "Private league on sub-12 — members only."
		if sum.Description != nil && *sum.Description != "" {
			desc = *sum.Description
		}
		h.render(w, shareMeta{
			Title:       fmt.Sprintf("%s · sub-12 league", sum.Name),
			Description: desc,
			Image:       h.imageURLOrDefault(sum.ImageURL),
			Canonical:   fmt.Sprintf("%s/app/leagues/%s", h.appURL, sum.ID),
			URL:         h.appURL + r.URL.Path,
			Type:        "article",
		})
		return
	}

	h.genericCard(w, r, "League · sub-12",
		"Target-shooting leagues and seasons on sub-12.")
}

// GET /share/clubs/{id}
func (h *ShareHandler) Club(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Public read: full club if visible, summary otherwise.
	club, err := h.clubs.GetByID(r.Context(), id, "")
	if err == nil && club != nil {
		desc := fmt.Sprintf("%d member club on sub-12.", club.MemberCount)
		if club.Description != nil && *club.Description != "" {
			desc = *club.Description
		}
		h.render(w, shareMeta{
			Title:       fmt.Sprintf("%s · sub-12 club", club.Name),
			Description: desc,
			Image:       h.imageURLOrDefault(club.ImageURL),
			Canonical:   fmt.Sprintf("%s/app/clubs/%s", h.appURL, club.ID),
			URL:         h.appURL + r.URL.Path,
			Type:        "article",
		})
		return
	}

	if sum, err := h.clubs.SummaryByID(r.Context(), id); err == nil && sum != nil {
		desc := "Private club on sub-12 — members only."
		if sum.Description != nil && *sum.Description != "" {
			desc = *sum.Description
		}
		h.render(w, shareMeta{
			Title:       fmt.Sprintf("%s · sub-12 club", sum.Name),
			Description: desc,
			Image:       h.imageURLOrDefault(sum.ImageURL),
			Canonical:   fmt.Sprintf("%s/app/clubs/%s", h.appURL, sum.ID),
			URL:         h.appURL + r.URL.Path,
			Type:        "article",
		})
		return
	}

	h.genericCard(w, r, "Club · sub-12",
		"Target-shooting clubs, standings, and posts on sub-12.")
}
