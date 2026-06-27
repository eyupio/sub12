package service

import (
	"context"
	"errors"
	"fmt"
	"math/rand"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog"
	"golang.org/x/crypto/bcrypt"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

// ErrInvalidSimulationSettings is returned when admin-supplied configuration
// fails validation.
var ErrInvalidSimulationSettings = errors.New("invalid simulation settings")

// maxPersonasPerProvision bounds how many simulated accounts a single
// EnsurePersonas call will create, so enabling a large persona_count never
// blocks a request (or a single tick) for too long.
const maxPersonasPerProvision = 25

// SimulationService drives the admin-controlled "activity simulation" feature:
// it provisions flagged simulated accounts and has them post score cards, like,
// comment and follow using the same service paths real users use (so activity
// feeds, achievements and counters all update naturally).
type SimulationService struct {
	repo       *repository.SimulationRepository
	scoreCards *ScoreCardService
	likes      *LikeService
	comments   *CommentService
	social     *SocialService
	log        zerolog.Logger

	mu       sync.Mutex // serializes RunOnce so ticks/run-now don't overlap
	rng      *rand.Rand
	personas []string // cached simulated user ids
}

func NewSimulationService(
	repo *repository.SimulationRepository,
	scoreCards *ScoreCardService,
	likes *LikeService,
	comments *CommentService,
	social *SocialService,
	log zerolog.Logger,
) *SimulationService {
	return &SimulationService{
		repo:       repo,
		scoreCards: scoreCards,
		likes:      likes,
		comments:   comments,
		social:     social,
		log:        log,
		rng:        rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

func (s *SimulationService) GetSettings(ctx context.Context) (*model.SimulationSettings, error) {
	return s.repo.GetSettings(ctx)
}

func (s *SimulationService) UpdateSettings(ctx context.Context, input *model.UpsertSimulationSettingsInput, updatedBy string) (*model.SimulationSettings, error) {
	if err := validateSimulationSettings(input); err != nil {
		return nil, err
	}
	return s.repo.UpsertSettings(ctx, input, updatedBy)
}

func validateSimulationSettings(in *model.UpsertSimulationSettingsInput) error {
	if in.PersonaCount < 0 || in.PersonaCount > 1000 {
		return fmt.Errorf("%w: persona_count must be between 0 and 1000", ErrInvalidSimulationSettings)
	}
	if in.ActionsPerHour < 0 || in.ActionsPerHour > 10000 {
		return fmt.Errorf("%w: actions_per_hour must be between 0 and 10000", ErrInvalidSimulationSettings)
	}
	for name, w := range map[string]int{
		"post_weight":    in.PostWeight,
		"like_weight":    in.LikeWeight,
		"comment_weight": in.CommentWeight,
		"follow_weight":  in.FollowWeight,
	} {
		if w < 0 {
			return fmt.Errorf("%w: %s must be >= 0", ErrInvalidSimulationSettings, name)
		}
	}
	if in.PostWeight+in.LikeWeight+in.CommentWeight+in.FollowWeight == 0 {
		return fmt.Errorf("%w: at least one action weight must be greater than 0", ErrInvalidSimulationSettings)
	}
	if in.ActiveStartHour < 0 || in.ActiveStartHour > 23 {
		return fmt.Errorf("%w: active_start_hour must be between 0 and 23", ErrInvalidSimulationSettings)
	}
	if in.ActiveEndHour < 1 || in.ActiveEndHour > 24 {
		return fmt.Errorf("%w: active_end_hour must be between 1 and 24", ErrInvalidSimulationSettings)
	}
	if in.MaxCardsPerPersona < 0 {
		return fmt.Errorf("%w: max_cards_per_persona must be >= 0", ErrInvalidSimulationSettings)
	}
	return nil
}

// Status returns a live snapshot for the admin dashboard.
func (s *SimulationService) Status(ctx context.Context) (*model.SimulationStatus, error) {
	settings, err := s.repo.GetSettings(ctx)
	if err != nil {
		return nil, err
	}
	userCount, err := s.repo.CountSimulatedUsers(ctx)
	if err != nil {
		return nil, err
	}
	cardCount, err := s.repo.CountSimulatedCards(ctx)
	if err != nil {
		return nil, err
	}
	return &model.SimulationStatus{
		Enabled:            settings.Enabled,
		PersonaCount:       settings.PersonaCount,
		SimulatedUserCount: userCount,
		SimulatedCardCount: cardCount,
		LastRunAt:          settings.LastRunAt,
		LastAction:         settings.LastAction,
	}, nil
}

// EnsurePersonas provisions simulated accounts up to target, creating at most
// maxPersonasPerProvision per call. Returns the number of accounts created.
func (s *SimulationService) EnsurePersonas(ctx context.Context, target int) (int, error) {
	current, err := s.repo.CountSimulatedUsers(ctx)
	if err != nil {
		return 0, err
	}
	need := target - current
	if need <= 0 {
		return 0, nil
	}
	if need > maxPersonasPerProvision {
		need = maxPersonasPerProvision
	}

	created := 0
	for i := 0; i < need; i++ {
		name := s.randomDisplayName()
		bio := s.randomBio()
		location := s.randomLocation()
		email := fmt.Sprintf("sim-%d-%d@simulated.local", time.Now().UnixNano(), s.rng.Intn(1_000_000))

		// Simulated accounts are not meant to be logged into; give them an
		// unguessable password hash so the row satisfies NOT NULL.
		hash, err := bcrypt.GenerateFromPassword([]byte(fmt.Sprintf("sim-%d-%d", time.Now().UnixNano(), s.rng.Int63())), bcrypt.DefaultCost)
		if err != nil {
			return created, fmt.Errorf("hash simulated password: %w", err)
		}

		if _, err := s.repo.CreateSimulatedUser(ctx, email, name, &bio, &location, string(hash)); err != nil {
			if errors.Is(err, repository.ErrConflict) {
				continue // email collision, try again next time
			}
			return created, err
		}
		created++
	}
	if created > 0 {
		s.personas = nil // invalidate cache so the new personas are picked up
	}
	return created, nil
}

// RunOnce provisions personas as needed and performs up to n simulated actions,
// but only while the feature is enabled. Used by the background runner. It is
// safe to call concurrently; calls are serialized.
func (s *SimulationService) RunOnce(ctx context.Context, n int) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	settings, err := s.repo.GetSettings(ctx)
	if err != nil {
		return 0, err
	}
	if !settings.Enabled {
		return 0, nil
	}
	return s.performBatch(ctx, settings, n)
}

// RunNow provisions personas and performs up to n actions immediately,
// regardless of the enabled flag. Backs the admin "run now" button so changes
// can be previewed without waiting for the next tick.
func (s *SimulationService) RunNow(ctx context.Context, n int) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	settings, err := s.repo.GetSettings(ctx)
	if err != nil {
		return 0, err
	}
	return s.performBatch(ctx, settings, n)
}

// performBatch provisions personas up to persona_count and performs up to n
// weighted actions. The caller must hold s.mu.
func (s *SimulationService) performBatch(ctx context.Context, settings *model.SimulationSettings, n int) (int, error) {
	if _, err := s.EnsurePersonas(ctx, settings.PersonaCount); err != nil {
		s.log.Warn().Err(err).Msg("simulation: ensure personas failed")
	}

	personas, err := s.loadPersonas(ctx, settings.PersonaCount)
	if err != nil {
		return 0, err
	}
	if len(personas) == 0 {
		return 0, nil
	}

	performed := 0
	var lastAction string
	for i := 0; i < n; i++ {
		action := s.pickAction(settings)
		actor := personas[s.rng.Intn(len(personas))]
		if s.execute(ctx, settings, action, actor) {
			performed++
			lastAction = action
		}
	}

	if performed > 0 {
		if err := s.repo.TouchRun(ctx, lastAction); err != nil {
			s.log.Warn().Err(err).Msg("simulation: touch run failed")
		}
	}
	return performed, nil
}

func (s *SimulationService) loadPersonas(ctx context.Context, limit int) ([]string, error) {
	if len(s.personas) > 0 {
		return s.personas, nil
	}
	if limit <= 0 {
		limit = 1
	}
	ids, err := s.repo.ListSimulatedUserIDs(ctx, limit)
	if err != nil {
		return nil, err
	}
	s.personas = ids
	return ids, nil
}

// pickAction selects an action label by weighted random choice.
func (s *SimulationService) pickAction(settings *model.SimulationSettings) string {
	type wa struct {
		name   string
		weight int
	}
	choices := []wa{
		{"post", settings.PostWeight},
		{"like", settings.LikeWeight},
		{"comment", settings.CommentWeight},
		{"follow", settings.FollowWeight},
	}
	total := 0
	for _, c := range choices {
		total += c.weight
	}
	if total <= 0 {
		return "like"
	}
	pick := s.rng.Intn(total)
	for _, c := range choices {
		if pick < c.weight {
			return c.name
		}
		pick -= c.weight
	}
	return "like"
}

// execute performs a single action as actor. Returns true if something
// observable happened. Failures are logged and treated as no-ops.
func (s *SimulationService) execute(ctx context.Context, settings *model.SimulationSettings, action, actor string) bool {
	simulatedOnly := !settings.InteractWithRealUsers
	switch action {
	case "post":
		return s.doPost(ctx, settings, actor)
	case "comment":
		return s.doComment(ctx, actor, simulatedOnly)
	case "follow":
		return s.doFollow(ctx, actor, simulatedOnly)
	default:
		return s.doLike(ctx, actor, simulatedOnly)
	}
}

func (s *SimulationService) doPost(ctx context.Context, settings *model.SimulationSettings, actor string) bool {
	if settings.MaxCardsPerPersona > 0 {
		count, err := s.repo.CountCardsForUser(ctx, actor)
		if err != nil {
			s.log.Warn().Err(err).Msg("simulation: count cards failed")
			return false
		}
		if count >= settings.MaxCardsPerPersona {
			return false
		}
	}

	scores, xs := s.randomShots()
	visibility := "public"
	shotAt := time.Now().UTC().Format("2006-01-02")
	input := &model.CreateScoreCardInput{
		ShotAt:     shotAt,
		ShotScores: scores,
		ShotXs:     xs,
		Visibility: &visibility,
	}
	if notes := s.randomNote(); notes != "" {
		input.Notes = &notes
	}
	if _, err := s.scoreCards.Create(ctx, actor, input); err != nil {
		s.log.Warn().Err(err).Msg("simulation: post score card failed")
		return false
	}
	return true
}

func (s *SimulationService) doLike(ctx context.Context, actor string, simulatedOnly bool) bool {
	cardID, _, err := s.repo.RandomPublicCard(ctx, actor, simulatedOnly)
	if err != nil {
		return false
	}
	if _, err := s.likes.Like(ctx, actor, cardID, model.LikeTargetScoreCard); err != nil {
		s.log.Warn().Err(err).Msg("simulation: like failed")
		return false
	}
	return true
}

func (s *SimulationService) doComment(ctx context.Context, actor string, simulatedOnly bool) bool {
	cardID, _, err := s.repo.RandomPublicCard(ctx, actor, simulatedOnly)
	if err != nil {
		return false
	}
	body := s.randomComment()
	if _, err := s.comments.Create(ctx, cardID, "score_card", actor, body, nil); err != nil {
		s.log.Warn().Err(err).Msg("simulation: comment failed")
		return false
	}
	return true
}

func (s *SimulationService) doFollow(ctx context.Context, actor string, simulatedOnly bool) bool {
	targetID, err := s.repo.RandomFollowTarget(ctx, actor, simulatedOnly)
	if err != nil {
		return false
	}
	if _, _, err := s.social.Follow(ctx, actor, targetID); err != nil {
		s.log.Warn().Err(err).Msg("simulation: follow failed")
		return false
	}
	return true
}

// --- random content helpers ---

var (
	simFirstNames = []string{"Alex", "Jordan", "Sam", "Casey", "Riley", "Morgan", "Taylor", "Jamie", "Drew", "Avery", "Quinn", "Harper", "Reese", "Skyler", "Cameron", "Rowan", "Emerson", "Finley", "Hayden", "Parker"}
	simLastNames  = []string{"Fletcher", "Archer", "Marks", "Bell", "Hart", "Reed", "Vance", "Cross", "Lane", "Pike", "Frost", "Wren", "Sharpe", "Quill", "Banks", "Drake", "Stone", "Wells", "Knox", "Doyle"}
	simLocations  = []string{"Yorkshire", "Devon", "Kent", "Cumbria", "Surrey", "Norfolk", "Dorset", "Suffolk", "Cheshire", "Highlands", "Powys", "Galway", "Cornwall", "Lothian"}
	simBios       = []string{
		"Weekend plinker chasing tighter groups.",
		"FT shooter, springer enthusiast.",
		"HFT every Sunday, rain or shine.",
		"On a mission to break sub-12 consistency.",
		"Bench rest and benchmark scores.",
		"Casual shooter, serious about pellets.",
		"Just here for the love of the sport.",
		"Always testing, always learning.",
	}
	simNotes = []string{
		"", "", "", // weight toward no note
		"Calm conditions today.",
		"Bit of a breeze on the right side.",
		"New pellet batch felt good.",
		"Happy with the consistency.",
		"Could've done better on the last few.",
		"Indoor session.",
	}
	simComments = []string{
		"Great shooting! 🎯",
		"Solid card, nice grouping.",
		"That's a strong score.",
		"Looking sharp 👌",
		"Nice work, keep it up!",
		"Tidy groups there.",
		"Impressive consistency.",
		"Love to see it.",
		"Cracking effort.",
		"That X count though! 🔥",
	}
)

func (s *SimulationService) randomDisplayName() string {
	return fmt.Sprintf("%s %s", simFirstNames[s.rng.Intn(len(simFirstNames))], simLastNames[s.rng.Intn(len(simLastNames))])
}

func (s *SimulationService) randomBio() string {
	return simBios[s.rng.Intn(len(simBios))]
}

func (s *SimulationService) randomLocation() string {
	return simLocations[s.rng.Intn(len(simLocations))]
}

func (s *SimulationService) randomNote() string {
	return strings.TrimSpace(simNotes[s.rng.Intn(len(simNotes))])
}

func (s *SimulationService) randomComment() string {
	return simComments[s.rng.Intn(len(simComments))]
}

// randomShots produces a plausible 25-shot card biased toward good scores, with
// X-ring hits only on 10s.
func (s *SimulationService) randomShots() ([]int16, []bool) {
	scores := make([]int16, 25)
	xs := make([]bool, 25)
	for i := 0; i < 25; i++ {
		// Bias toward 8-10 with the occasional lower shot.
		roll := s.rng.Intn(100)
		var score int16
		switch {
		case roll < 55:
			score = 10
		case roll < 80:
			score = 9
		case roll < 93:
			score = 8
		case roll < 98:
			score = 7
		default:
			score = int16(4 + s.rng.Intn(3)) // 4-6
		}
		scores[i] = score
		if score == 10 && s.rng.Intn(100) < 40 {
			xs[i] = true
		}
	}
	return scores, xs
}
