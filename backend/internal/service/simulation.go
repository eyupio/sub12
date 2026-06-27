package service

import (
	"context"
	"errors"
	"fmt"
	"hash/fnv"
	"math/rand"
	"strings"
	"sync"
	"sync/atomic"
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

// actionRetries is how many times performBatch re-picks an action for a slot
// when the previous attempt was a no-op (e.g. a persona hit its card cap, or
// no eligible like/comment/follow target existed). Keeps the effective action
// rate close to the configured budget instead of silently decaying.
const actionRetries = 3

// simulationRepo is the subset of repository methods the service depends on.
// Declared as an interface so the service can be unit-tested with a mock,
// matching the mockScoreCardRepo convention used elsewhere.
type simulationRepo interface {
	GetSettings(ctx context.Context) (*model.SimulationSettings, error)
	UpsertSettings(ctx context.Context, input *model.UpsertSimulationSettingsInput, updatedBy string) (*model.SimulationSettings, error)
	IncrementCounts(ctx context.Context, counts map[string]int, lastAction, lastErr string) error
	TouchTick(ctx context.Context) error
	CreateSimulatedUser(ctx context.Context, email, displayName string, bio, location *string, passwordHash string) (string, error)
	CountSimulatedUsers(ctx context.Context) (int, error)
	IsSimulatedUser(ctx context.Context, userID string) (bool, error)
	CountSimulatedCards(ctx context.Context) (int, error)
	ListSimulatedUserIDs(ctx context.Context, limit int) ([]string, error)
	ListSimulatedPersonas(ctx context.Context, limit, offset int) ([]*model.SimulatedPersona, int, error)
	DeleteSimulatedUser(ctx context.Context, id string) error
	DeleteAllSimulated(ctx context.Context) (int, error)
	TrimSimulatedTo(ctx context.Context, target int) (int, error)
	CountCardsForUser(ctx context.Context, userID string) (int, error)
	RandomPublicCard(ctx context.Context, excludeUserID string, simulatedOnly bool) (string, string, error)
	RandomFollowTarget(ctx context.Context, excludeUserID string, simulatedOnly bool) (string, error)
	RandomPublicPost(ctx context.Context, excludeUserID string, simulatedOnly bool) (string, error)
	RandomActivity(ctx context.Context, excludeUserID string, simulatedOnly bool) (string, error)
	RandomFollowedUser(ctx context.Context, followerID string, simulatedOnly bool) (string, error)
	RecordAudit(ctx context.Context, event, actorID string, detail string) error
	ListAudit(ctx context.Context, limit, offset int) ([]*model.SimulationAudit, int, error)
	UpdateSimulatedProfile(ctx context.Context, id string, in *model.UpdateSimulatedPersonaInput) (*model.AdminUser, error)
	UpdateSimulatedAvatarURL(ctx context.Context, id, avatarURL string) (*model.AdminUser, error)
	DeleteSimulatedAvatarURL(ctx context.Context, id string) (*model.AdminUser, error)
}

// Compile-time assertion that the concrete repository satisfies the interface.
var _ simulationRepo = (*repository.SimulationRepository)(nil)

// gearIDs holds the cached active rifle/pellet ids for a simulated persona.
type gearIDs struct {
	rifle  string
	pellet string
}

// personaProfile holds personality traits in [0,1] derived from a stable hash
// of the persona id. They bias action selection so personas behave distinctly:
// loquacious -> more comments, sociable -> more follows, competitive -> more posts.
type personaProfile struct {
	loquacious   float64
	sociable     float64
	competitive  float64
}

// SimulationService drives the admin-controlled "activity simulation" feature:
// it provisions flagged simulated accounts and has them post score cards, like,
// comment, follow (and unfollow), and share using the same service paths real
// users use (so activity feeds, achievements and counters all update naturally).
type SimulationService struct {
	repo       simulationRepo
	scoreCards *ScoreCardService
	likes      *LikeService
	comments   *CommentService
	social     *SocialService
	rifles     *RifleService
	pellets    *PelletService
	posts      *PostService
	leagues    *LeagueService
	clubs      *ClubService
	log        zerolog.Logger

	// mu serializes the action loop so ticks/run-now don't overlap. Provisioning
	// runs outside mu (see RunOnce/RunNow) so bcrypt + inserts don't stall ticks.
	mu sync.Mutex
	// rngMu protects the shared rng, which is touched by both the (unlocked)
	// provisioning path and the (locked) action loop.
	rngMu sync.Mutex
	rng   *rand.Rand
	// cacheMu protects the persona/skill/gear/profile caches.
	cacheMu     sync.Mutex
	personas    []string              // cached simulated user ids
	skills      map[string]float64    // cached per-persona skill bias in [0,1]
	gear        map[string]gearIDs    // cached per-persona active rifle/pellet ids
	profiles    map[string]personaProfile
	// includePublic is the cached IncludeInPublicStats flag, used by the feed /
	// leaderboard via ExcludeSimulatedFromPublic. Synced whenever settings are read.
	includePublic atomic.Bool
}

func NewSimulationService(
	repo *repository.SimulationRepository,
	scoreCards *ScoreCardService,
	likes *LikeService,
	comments *CommentService,
	social *SocialService,
	rifles *RifleService,
	pellets *PelletService,
	posts *PostService,
	leagues *LeagueService,
	clubs *ClubService,
	log zerolog.Logger,
) *SimulationService {
	s := &SimulationService{
		repo:       repo,
		scoreCards: scoreCards,
		likes:      likes,
		comments:   comments,
		social:     social,
		rifles:     rifles,
		pellets:    pellets,
		posts:      posts,
		leagues:    leagues,
		clubs:      clubs,
		log:        log,
		rng:        rand.New(rand.NewSource(time.Now().UnixNano())),
		skills:     map[string]float64{},
		gear:       map[string]gearIDs{},
		profiles:   map[string]personaProfile{},
	}
	s.includePublic.Store(true) // DB default; refreshed on first settings read
	return s
}

// randIntn is a thread-safe wrapper around the shared rng.
func (s *SimulationService) randIntn(n int) int {
	if n <= 0 {
		return 0
	}
	s.rngMu.Lock()
	defer s.rngMu.Unlock()
	return s.rng.Intn(n)
}

func (s *SimulationService) GetSettings(ctx context.Context) (*model.SimulationSettings, error) {
	st, err := s.repo.GetSettings(ctx)
	if err != nil {
		return nil, err
	}
	s.includePublic.Store(st.IncludeInPublicStats)
	return st, nil
}

func (s *SimulationService) UpdateSettings(ctx context.Context, input *model.UpsertSimulationSettingsInput, updatedBy string) (*model.SimulationSettings, error) {
	if err := validateSimulationSettings(input); err != nil {
		return nil, err
	}

	// Capture the previous state so we can audit what changed.
	prev, _ := s.repo.GetSettings(ctx)

	updated, err := s.repo.UpsertSettings(ctx, input, updatedBy)
	if err != nil {
		return nil, err
	}
	s.includePublic.Store(updated.IncludeInPublicStats)

	// Settings changes can alter which personas are eligible, so drop the
	// cached persona list. The next batch reloads at the new persona_count.
	s.InvalidatePersonas()

	// Audit the high-impact toggles. prev may be nil on the very first save.
	if prev != nil {
		if prev.Enabled != updated.Enabled || prev.InteractWithRealUsers != updated.InteractWithRealUsers || prev.IncludeInPublicStats != updated.IncludeInPublicStats {
			detail := fmt.Sprintf(
				`{"enabled":{"from":%t,"to":%t},"interact_with_real_users":{"from":%t,"to":%t},"include_in_public_stats":{"from":%t,"to":%t}}`,
				prev.Enabled, updated.Enabled,
				prev.InteractWithRealUsers, updated.InteractWithRealUsers,
				prev.IncludeInPublicStats, updated.IncludeInPublicStats,
			)
			if err := s.repo.RecordAudit(ctx, "settings_updated", updatedBy, detail); err != nil {
				s.log.Warn().Err(err).Msg("simulation: audit settings_updated failed")
			}
		}
	}

	return updated, nil
}

// ExcludeSimulatedFromPublic reports whether simulated content should be
// excluded from public surfaces (feed, leaderboards). Satisfies
// SimulatedContentFilter. Returns true when the admin has turned
// include_in_public_stats off.
func (s *SimulationService) ExcludeSimulatedFromPublic() bool {
	return !s.includePublic.Load()
}

// InvalidatePersonas clears the cached persona id list, skill, gear and profile
// maps so the next batch reloads them from the database at the current
// persona_count.
func (s *SimulationService) InvalidatePersonas() {
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	s.personas = nil
	s.skills = map[string]float64{}
	s.gear = map[string]gearIDs{}
	s.profiles = map[string]personaProfile{}
}

func validateSimulationSettings(in *model.UpsertSimulationSettingsInput) error {
	if in.PersonaCount < 0 || in.PersonaCount > 1000 {
		return fmt.Errorf("%w: persona_count must be between 0 and 1000", ErrInvalidSimulationSettings)
	}
	if in.ActionsPerHour < 0 || in.ActionsPerHour > 10000 {
		return fmt.Errorf("%w: actions_per_hour must be between 0 and 10000", ErrInvalidSimulationSettings)
	}
	for name, w := range map[string]int{
		"post_weight":     in.PostWeight,
		"like_weight":     in.LikeWeight,
		"comment_weight":  in.CommentWeight,
		"follow_weight":   in.FollowWeight,
		"unfollow_weight": in.UnfollowWeight,
		"share_weight":    in.ShareWeight,
	} {
		if w < 0 {
			return fmt.Errorf("%w: %s must be >= 0", ErrInvalidSimulationSettings, name)
		}
	}
	if in.PostWeight+in.LikeWeight+in.CommentWeight+in.FollowWeight+in.UnfollowWeight+in.ShareWeight == 0 {
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
	s.includePublic.Store(settings.IncludeInPublicStats)
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
		LastTickAt:         settings.LastTickAt,
		TotalActions:       settings.TotalActions,
		PostCount:          settings.PostCount,
		LikeCount:          settings.LikeCount,
		CommentCount:       settings.CommentCount,
		FollowCount:        settings.FollowCount,
		UnfollowCount:      settings.UnfollowCount,
		ShareCount:         settings.ShareCount,
		LastError:          settings.LastError,
		LastErrorAt:        settings.LastErrorAt,
	}, nil
}

// EnsurePersonas provisions simulated accounts up to target, creating at most
// maxPersonasPerProvision per call. Each new account also gets a randomized
// rifle and pellet so its score cards carry gear. Safe to call without holding
// s.mu. Returns the number of accounts created.
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
		email := fmt.Sprintf("sim-%d-%d@simulated.local", time.Now().UnixNano(), s.randIntn(1_000_000))

		// Simulated accounts are not meant to be logged into; give them an
		// unguessable password hash at minimum cost so the row satisfies
		// NOT NULL without burning CPU.
		hash, err := bcrypt.GenerateFromPassword([]byte(fmt.Sprintf("sim-%d-%d", time.Now().UnixNano(), s.randIntn(1_000_000))), bcrypt.MinCost)
		if err != nil {
			return created, fmt.Errorf("hash simulated password: %w", err)
		}

		userID, err := s.repo.CreateSimulatedUser(ctx, email, name, &bio, &location, string(hash))
		if err != nil {
			if errors.Is(err, repository.ErrConflict) {
				continue // email collision, try again next time
			}
			return created, err
		}

		// Provision one active rifle + pellet for the persona so its cards
		// carry gear badges and feed into rifle/pellet stats. Failures are
		// non-fatal: the persona simply posts without gear.
		s.provisionGear(ctx, userID)

		created++
	}
	if created > 0 {
		s.InvalidatePersonas()
	}
	return created, nil
}

// provisionGear creates a randomized rifle and pellet for a simulated user and
// caches the resulting ids. Errors are logged and swallowed.
func (s *SimulationService) provisionGear(ctx context.Context, userID string) {
	if s.rifles != nil {
		r := s.randomRifleInput()
		if rifle, err := s.rifles.Create(ctx, userID, r); err == nil {
			s.cacheGear(userID, gearIDs{rifle: rifle.ID}, true)
		} else {
			s.log.Warn().Err(err).Msg("simulation: create rifle failed")
		}
	}
	if s.pellets != nil {
		p := s.randomPelletInput()
		if pellet, err := s.pellets.Create(ctx, userID, p); err == nil {
			s.cacheGear(userID, gearIDs{pellet: pellet.ID}, false)
		} else {
			s.log.Warn().Err(err).Msg("simulation: create pellet failed")
		}
	}
}

// cacheGear stores a gear id for a persona. If merge is true, the existing
// entry is kept and only the empty side is filled.
func (s *SimulationService) cacheGear(userID string, g gearIDs, merge bool) {
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	if merge {
		existing := s.gear[userID]
		if g.rifle != "" {
			existing.rifle = g.rifle
		}
		if g.pellet != "" {
			existing.pellet = g.pellet
		}
		s.gear[userID] = existing
		return
	}
	existing := s.gear[userID]
	if g.rifle != "" {
		existing.rifle = g.rifle
	}
	if g.pellet != "" {
		existing.pellet = g.pellet
	}
	s.gear[userID] = existing
}

// personaGear returns the cached active rifle/pellet ids for a persona, loading
// them from the gear services on cache miss.
func (s *SimulationService) personaGear(ctx context.Context, userID string) gearIDs {
	s.cacheMu.Lock()
	g, ok := s.gear[userID]
	s.cacheMu.Unlock()
	if ok && (g.rifle != "" || g.pellet != "") {
		return g
	}
	if s.rifles != nil {
		if rs, err := s.rifles.List(ctx, userID, true); err == nil && len(rs) > 0 {
			g.rifle = rs[0].ID
		}
	}
	if s.pellets != nil {
		if ps, err := s.pellets.List(ctx, userID, true); err == nil && len(ps) > 0 {
			g.pellet = ps[0].ID
		}
	}
	s.cacheGear(userID, g, false)
	return g
}

// RunOnce provisions personas as needed and performs up to n simulated actions,
// but only while the feature is enabled. Used by the background runner.
// Provisioning runs without s.mu so bcrypt/inserts don't stall the action loop.
func (s *SimulationService) RunOnce(ctx context.Context, n int) (int, map[string]int, error) {
	settings, err := s.repo.GetSettings(ctx)
	if err != nil {
		return 0, nil, err
	}
	if !settings.Enabled {
		return 0, nil, nil
	}
	// Provision outside the action lock.
	if _, err := s.EnsurePersonas(ctx, settings.PersonaCount); err != nil {
		s.log.Warn().Err(err).Msg("simulation: ensure personas failed")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.performActions(ctx, settings, n)
}

// RunNow provisions personas and performs up to n actions immediately,
// regardless of the enabled flag. Backs the admin "run now" button. Returns the
// total performed and a per-action counts map.
func (s *SimulationService) RunNow(ctx context.Context, n int, actorID string) (int, map[string]int, error) {
	settings, err := s.repo.GetSettings(ctx)
	if err != nil {
		return 0, nil, err
	}
	if _, err := s.EnsurePersonas(ctx, settings.PersonaCount); err != nil {
		s.log.Warn().Err(err).Msg("simulation: ensure personas failed")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	performed, counts, err := s.performActions(ctx, settings, n)
	if err == nil {
		if auditErr := s.repo.RecordAudit(ctx, "run_now", actorID, fmt.Sprintf(`{"actions":%d,"performed":%d}`, n, performed)); auditErr != nil {
			s.log.Warn().Err(auditErr).Msg("simulation: audit run_now failed")
		}
	}
	return performed, counts, err
}

// performActions performs up to n weighted actions. The caller must hold s.mu.
// Returns the total performed and a per-action counts map.
func (s *SimulationService) performActions(ctx context.Context, settings *model.SimulationSettings, n int) (int, map[string]int, error) {
	personas, err := s.loadPersonas(ctx, settings.PersonaCount)
	if err != nil {
		return 0, nil, err
	}
	if len(personas) == 0 {
		return 0, nil, nil
	}

	performed := 0
	counts := map[string]int{"post": 0, "like": 0, "comment": 0, "follow": 0, "unfollow": 0, "share": 0}
	var lastAction, firstErr string
	for i := 0; i < n; i++ {
		// Retry a slot a few times so a no-op (card cap, no eligible target)
		// doesn't silently discard the action budget.
		for attempt := 0; attempt < actionRetries; attempt++ {
			actor := personas[s.randIntn(len(personas))]
			action := s.pickAction(settings, actor)
			res := s.execute(ctx, settings, action, actor)
			if res.ok {
				performed++
				counts[action]++
				lastAction = action
				break
			}
			if res.err != "" && firstErr == "" {
				firstErr = res.err
			}
		}
	}

	if performed > 0 || firstErr != "" {
		if err := s.repo.IncrementCounts(ctx, counts, lastAction, firstErr); err != nil {
			s.log.Warn().Err(err).Msg("simulation: increment counts failed")
		}
	}
	return performed, counts, nil
}

// loadPersonas returns the cached persona id list, reloading from the database
// when the cache is empty. When the cached list is longer than limit (because
// persona_count was lowered), it is truncated to the oldest limit entries so
// the engine stops acting on behalf of surplus accounts.
func (s *SimulationService) loadPersonas(ctx context.Context, limit int) ([]string, error) {
	if limit <= 0 {
		limit = 1
	}
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	if len(s.personas) == 0 {
		ids, err := s.repo.ListSimulatedUserIDs(ctx, limit)
		if err != nil {
			return nil, err
		}
		s.personas = ids
		return ids, nil
	}
	if len(s.personas) > limit {
		s.personas = s.personas[:limit]
	}
	return s.personas, nil
}

// personaSkill returns a stable skill bias in [0,1] for a persona, derived from
// a hash of its id so the same account always shoots to the same standard.
func (s *SimulationService) personaSkill(id string) float64 {
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	if v, ok := s.skills[id]; ok {
		return v
	}
	v := hashedUnit(id, 0)
	if s.skills == nil {
		s.skills = map[string]float64{}
	}
	s.skills[id] = v
	return v
}

// personaProfile returns the stable personality traits for a persona.
func (s *SimulationService) personaProfile(id string) personaProfile {
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	if p, ok := s.profiles[id]; ok {
		return p
	}
	p := personaProfile{
		loquacious:  hashedUnit(id, 1),
		sociable:    hashedUnit(id, 2),
		competitive: hashedUnit(id, 3),
	}
	if s.profiles == nil {
		s.profiles = map[string]personaProfile{}
	}
	s.profiles[id] = p
	return p
}

// hashedUnit returns a stable float64 in [0,1) derived from a hash of seed+salt.
func hashedUnit(seed string, salt uint64) float64 {
	h := fnv.New64a()
	h.Write([]byte(seed))
	var b [8]byte
	for i := 0; i < 8; i++ {
		b[i] = byte(salt >> (8 * i))
	}
	h.Write(b[:])
	return float64(h.Sum64()%10000) / 10000.0
}

// pickAction selects an action label by weighted random choice, with the base
// weights biased by the actor's personality profile.
func (s *SimulationService) pickAction(settings *model.SimulationSettings, actor string) string {
	p := s.personaProfile(actor)
	type wa struct {
		name   string
		weight float64
	}
	choices := []wa{
		{"post", float64(settings.PostWeight) * (0.5 + p.competitive)},
		{"like", float64(settings.LikeWeight)},
		{"comment", float64(settings.CommentWeight) * (0.5 + p.loquacious)},
		{"follow", float64(settings.FollowWeight) * (0.5 + p.sociable)},
		{"unfollow", float64(settings.UnfollowWeight)},
		{"share", float64(settings.ShareWeight) * (0.5 + p.sociable)},
	}
	total := 0.0
	for _, c := range choices {
		total += c.weight
	}
	if total <= 0 {
		return "like"
	}
	pick := s.randFloat(total)
	for _, c := range choices {
		if pick < c.weight {
			return c.name
		}
		pick -= c.weight
	}
	return "like"
}

// randFloat returns a uniform random float in [0,n) using the shared rng.
func (s *SimulationService) randFloat(n float64) float64 {
	s.rngMu.Lock()
	defer s.rngMu.Unlock()
	return s.rng.Float64() * n
}

// actionResult reports the outcome of a single simulated action.
type actionResult struct {
	ok  bool
	err string // short error description when ok is false
}

// execute performs a single action as actor.
func (s *SimulationService) execute(ctx context.Context, settings *model.SimulationSettings, action, actor string) actionResult {
	simulatedOnly := !settings.InteractWithRealUsers
	switch action {
	case "post":
		return s.doPost(ctx, settings, actor)
	case "comment":
		ok := s.doComment(ctx, actor, simulatedOnly)
		return actionResult{ok: ok}
	case "follow":
		ok := s.doFollow(ctx, actor, simulatedOnly)
		return actionResult{ok: ok}
	case "unfollow":
		ok := s.doUnfollow(ctx, actor, simulatedOnly)
		return actionResult{ok: ok}
	case "share":
		ok := s.doShare(ctx, actor, simulatedOnly)
		return actionResult{ok: ok}
	default:
		ok := s.doLike(ctx, actor, simulatedOnly)
		return actionResult{ok: ok}
	}
}

func (s *SimulationService) doPost(ctx context.Context, settings *model.SimulationSettings, actor string) actionResult {
	if settings.MaxCardsPerPersona > 0 {
		count, err := s.repo.CountCardsForUser(ctx, actor)
		if err != nil {
			s.log.Warn().Err(err).Msg("simulation: count cards failed")
			return actionResult{err: "count cards failed"}
		}
		if count >= settings.MaxCardsPerPersona {
			return actionResult{err: "persona at card cap"}
		}
	}

	skill := s.personaSkill(actor)
	scores, xs := s.randomShots(skill)
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
	if discipline := s.randomDiscipline(); discipline != "" {
		input.Discipline = &discipline
	}
	if loc := s.randomLocation(); loc != "" {
		l := loc
		input.Location = &l
	}
	if d := s.randomDistance(); d > 0 {
		input.DistanceM = &d
	}
	// Attach the persona's active rifle + pellet so cards carry gear badges.
	gear := s.personaGear(ctx, actor)
	if gear.rifle != "" {
		input.RifleID = &gear.rifle
	}
	if gear.pellet != "" {
		input.PelletID = &gear.pellet
	}
	if _, err := s.scoreCards.Create(ctx, actor, input); err != nil {
		s.log.Warn().Err(err).Msg("simulation: post score card failed")
		return actionResult{err: "post failed"}
	}
	return actionResult{ok: true}
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

// doComment posts a comment on a randomly chosen score card, post, or activity.
// Score cards are weighted heaviest since they dominate public content.
func (s *SimulationService) doComment(ctx context.Context, actor string, simulatedOnly bool) bool {
	var targetID, targetType string
	roll := s.randIntn(10)
	switch {
	case roll < 6:
		id, _, err := s.repo.RandomPublicCard(ctx, actor, simulatedOnly)
		if err != nil {
			return false
		}
		targetID, targetType = id, "score_card"
	case roll < 9:
		id, err := s.repo.RandomPublicPost(ctx, actor, simulatedOnly)
		if err != nil {
			// Fall back to a score card when no eligible post exists.
			id2, _, err2 := s.repo.RandomPublicCard(ctx, actor, simulatedOnly)
			if err2 != nil {
				return false
			}
			targetID, targetType = id2, "score_card"
		} else {
			targetID, targetType = id, "post"
		}
	default:
		id, err := s.repo.RandomActivity(ctx, actor, simulatedOnly)
		if err != nil {
			id2, _, err2 := s.repo.RandomPublicCard(ctx, actor, simulatedOnly)
			if err2 != nil {
				return false
			}
			targetID, targetType = id2, "score_card"
		} else {
			targetID, targetType = id, "activity"
		}
	}
	body := s.randomComment()
	if _, err := s.comments.Create(ctx, targetID, targetType, actor, body, nil); err != nil {
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

// doUnfollow removes a random follow relationship so the follow graph doesn't
// only ever grow (which would saturate personas and block new follows).
func (s *SimulationService) doUnfollow(ctx context.Context, actor string, simulatedOnly bool) bool {
	targetID, err := s.repo.RandomFollowedUser(ctx, actor, simulatedOnly)
	if err != nil {
		return false
	}
	if err := s.social.Unfollow(ctx, actor, targetID); err != nil {
		s.log.Warn().Err(err).Msg("simulation: unfollow failed")
		return false
	}
	return true
}

// doShare creates a share-post referencing a random public score card.
func (s *SimulationService) doShare(ctx context.Context, actor string, simulatedOnly bool) bool {
	if s.posts == nil {
		return false
	}
	cardID, _, err := s.repo.RandomPublicCard(ctx, actor, simulatedOnly)
	if err != nil {
		return false
	}
	vis := "public"
	in := &model.ShareInput{
		TargetID:   cardID,
		TargetType: "score_card",
		Body:       s.randomShareBody(),
		Visibility: vis,
	}
	if _, err := s.posts.Share(ctx, actor, in); err != nil {
		s.log.Warn().Err(err).Msg("simulation: share failed")
		return false
	}
	return true
}

// --- admin management methods ---

// ListPersonas returns a paginated list of simulated accounts.
func (s *SimulationService) ListPersonas(ctx context.Context, limit, offset int) ([]*model.SimulatedPersona, int, error) {
	return s.repo.ListSimulatedPersonas(ctx, limit, offset)
}

// DeletePersona removes a single simulated account (and, via cascade, all of
// its content). actorID is the admin performing the deletion, for audit.
func (s *SimulationService) DeletePersona(ctx context.Context, id, actorID string) error {
	if err := s.repo.DeleteSimulatedUser(ctx, id); err != nil {
		return err
	}
	s.InvalidatePersonas()
	if err := s.repo.RecordAudit(ctx, "persona_deleted", actorID, fmt.Sprintf(`{"id":%q}`, id)); err != nil {
		s.log.Warn().Err(err).Msg("simulation: audit persona_deleted failed")
	}
	return nil
}

// PurgeAll removes every simulated account and all of its content. Returns the
// number of accounts deleted.
func (s *SimulationService) PurgeAll(ctx context.Context, actorID string) (int, error) {
	n, err := s.repo.DeleteAllSimulated(ctx)
	if err != nil {
		return 0, err
	}
	s.InvalidatePersonas()
	if err := s.repo.RecordAudit(ctx, "purged", actorID, fmt.Sprintf(`{"deleted":%d}`, n)); err != nil {
		s.log.Warn().Err(err).Msg("simulation: audit purged failed")
	}
	return n, nil
}

// Cleanup trims the simulated account roster down to target, removing the
// newest excess accounts first. Returns the number deleted.
func (s *SimulationService) Cleanup(ctx context.Context, target int, actorID string) (int, error) {
	n, err := s.repo.TrimSimulatedTo(ctx, target)
	if err != nil {
		return 0, err
	}
	s.InvalidatePersonas()
	if err := s.repo.RecordAudit(ctx, "cleanup", actorID, fmt.Sprintf(`{"target":%d,"deleted":%d}`, target, n)); err != nil {
		s.log.Warn().Err(err).Msg("simulation: audit cleanup failed")
	}
	return n, nil
}

// ListAudit returns the most recent audit entries.
func (s *SimulationService) ListAudit(ctx context.Context, limit, offset int) ([]*model.SimulationAudit, int, error) {
	return s.repo.ListAudit(ctx, limit, offset)
}

// UpdatePersona applies a partial profile update to a simulated account. Only
// simulated accounts can be edited through this path. actorID is the admin
// performing the change, for audit.
func (s *SimulationService) UpdatePersona(ctx context.Context, id, actorID string, in *model.UpdateSimulatedPersonaInput) (*model.AdminUser, error) {
	if in.DisplayName != nil && strings.TrimSpace(*in.DisplayName) == "" {
		return nil, fmt.Errorf("%w: display_name cannot be blank", ErrInvalidSimulationSettings)
	}
	if in.DisplayName != nil && len(*in.DisplayName) > 64 {
		return nil, fmt.Errorf("%w: display_name must be 64 characters or fewer", ErrInvalidSimulationSettings)
	}
	updated, err := s.repo.UpdateSimulatedProfile(ctx, id, in)
	if err != nil {
		return nil, err
	}
	s.InvalidatePersonas()
	if err := s.repo.RecordAudit(ctx, "persona_updated", actorID, fmt.Sprintf(`{"id":%q}`, id)); err != nil {
		s.log.Warn().Err(err).Msg("simulation: audit persona_updated failed")
	}
	return updated, nil
}

// SetPersonaAvatar records an avatar URL on a simulated account. The image
// bytes are stored by the handler (via the image repository); this method only
// persists the resulting URL. actorID is the admin, for audit.
func (s *SimulationService) SetPersonaAvatar(ctx context.Context, id, avatarURL, actorID string) (*model.AdminUser, error) {
	updated, err := s.repo.UpdateSimulatedAvatarURL(ctx, id, avatarURL)
	if err != nil {
		return nil, err
	}
	s.InvalidatePersonas()
	if err := s.repo.RecordAudit(ctx, "persona_avatar", actorID, fmt.Sprintf(`{"id":%q}`, id)); err != nil {
		s.log.Warn().Err(err).Msg("simulation: audit persona_avatar failed")
	}
	return updated, nil
}

// RemovePersonaAvatar clears the avatar_url on a simulated account. actorID is
// the admin, for audit.
func (s *SimulationService) RemovePersonaAvatar(ctx context.Context, id, actorID string) (*model.AdminUser, error) {
	updated, err := s.repo.DeleteSimulatedAvatarURL(ctx, id)
	if err != nil {
		return nil, err
	}
	s.InvalidatePersonas()
	if err := s.repo.RecordAudit(ctx, "persona_avatar_remove", actorID, fmt.Sprintf(`{"id":%q}`, id)); err != nil {
		s.log.Warn().Err(err).Msg("simulation: audit persona_avatar_remove failed")
	}
	return updated, nil
}

// JoinPersonaToLeague enrols a simulated account into a league so it can
// interact with league content (posts, rounds). Verifies the persona is
// simulated before joining. Idempotent (already-a-member is not an error).
func (s *SimulationService) JoinPersonaToLeague(ctx context.Context, personaID, leagueID, actorID string) error {
	if err := s.requireSimulated(ctx, personaID); err != nil {
		return err
	}
	if s.leagues == nil {
		return errors.New("league service not configured")
	}
	if err := s.leagues.AdminAddMember(ctx, leagueID, personaID); err != nil {
		return err
	}
	if err := s.repo.RecordAudit(ctx, "persona_joined_league", actorID, fmt.Sprintf(`{"persona":%q,"league":%q}`, personaID, leagueID)); err != nil {
		s.log.Warn().Err(err).Msg("simulation: audit persona_joined_league failed")
	}
	return nil
}

// JoinPersonaToClub enrols a simulated account into a club so it can interact
// with club content (posts, club leagues). Verifies the persona is simulated.
// Idempotent.
func (s *SimulationService) JoinPersonaToClub(ctx context.Context, personaID, clubID, actorID string) error {
	if err := s.requireSimulated(ctx, personaID); err != nil {
		return err
	}
	if s.clubs == nil {
		return errors.New("club service not configured")
	}
	if err := s.clubs.AdminAddMember(ctx, clubID, personaID); err != nil {
		return err
	}
	if err := s.repo.RecordAudit(ctx, "persona_joined_club", actorID, fmt.Sprintf(`{"persona":%q,"club":%q}`, personaID, clubID)); err != nil {
		s.log.Warn().Err(err).Msg("simulation: audit persona_joined_club failed")
	}
	return nil
}

// requireSimulated returns ErrNotFound when the user does not exist or is not a
// flagged simulated account, guarding admin enrolment endpoints.
func (s *SimulationService) requireSimulated(ctx context.Context, userID string) error {
	ok, err := s.repo.IsSimulatedUser(ctx, userID)
	if err != nil {
		return err
	}
	if !ok {
		return repository.ErrNotFound
	}
	return nil
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
	simDisciplines = []string{"benchrest", "hft", "ft", "sporter", "field"}
	simDistances   = []int{10, 15, 20, 25, 30, 40, 50}
	simShareBodies = []string{
		"Worth a look.",
		"Nice card, had to share.",
		"This is the way.",
		"Goals right here.",
		"Solid effort.",
	}
	// simRifles/simPellets are small Go-side catalogs mirroring the frontend
	// catalogs so simulated personas get realistic gear without an import cycle.
	simRifles = []model.CreateRifleInput{
		{Make: "Air Arms", Model: "S510", Calibre: ".177", PowerFtLb: ptrFloat(11.5)},
		{Make: "Air Arms", Model: "TX200", Calibre: ".177", PowerFtLb: ptrFloat(11.5)},
		{Make: "Walther", Model: "LGU", Calibre: ".177", PowerFtLb: ptrFloat(11.5)},
		{Make: "Weihrauch", Model: "HW100", Calibre: ".177", PowerFtLb: ptrFloat(11.5)},
		{Make: "Weihrauch", Model: "HW97K", Calibre: ".177", PowerFtLb: ptrFloat(11.5)},
		{Make: "BSA", Model: "R10", Calibre: ".177", PowerFtLb: ptrFloat(11.5)},
		{Make: "Daystate", Model: "Red Wolf", Calibre: ".177", PowerFtLb: ptrFloat(11.5)},
	}
	simPellets = []model.CreatePelletInput{
		{Brand: "JSB", Model: "Exact", HeadSizeMM: ptrFloat(4.52), WeightGrains: ptrFloat(8.44)},
		{Brand: "JSB", Model: "Exact RS", HeadSizeMM: ptrFloat(4.52), WeightGrains: ptrFloat(7.33)},
		{Brand: "AA Fields", Model: "Diabolo", HeadSizeMM: ptrFloat(4.50), WeightGrains: ptrFloat(8.4)},
		{Brand: "H&N", Model: "Baracuda", HeadSizeMM: ptrFloat(4.50), WeightGrains: ptrFloat(9.57)},
		{Brand: "H&N", Model: "FTT", HeadSizeMM: ptrFloat(4.50), WeightGrains: ptrFloat(8.64)},
	}
)

func ptrFloat(v float64) *float64 { return &v }

func (s *SimulationService) randomDisplayName() string {
	return fmt.Sprintf("%s %s", simFirstNames[s.randIntn(len(simFirstNames))], simLastNames[s.randIntn(len(simLastNames))])
}

func (s *SimulationService) randomBio() string {
	return simBios[s.randIntn(len(simBios))]
}

func (s *SimulationService) randomLocation() string {
	return simLocations[s.randIntn(len(simLocations))]
}

func (s *SimulationService) randomNote() string {
	return strings.TrimSpace(simNotes[s.randIntn(len(simNotes))])
}

func (s *SimulationService) randomComment() string {
	return simComments[s.randIntn(len(simComments))]
}

func (s *SimulationService) randomDiscipline() string {
	return simDisciplines[s.randIntn(len(simDisciplines))]
}

func (s *SimulationService) randomDistance() int {
	return simDistances[s.randIntn(len(simDistances))]
}

func (s *SimulationService) randomShareBody() string {
	return simShareBodies[s.randIntn(len(simShareBodies))]
}

func (s *SimulationService) randomRifleInput() *model.CreateRifleInput {
	r := simRifles[s.randIntn(len(simRifles))]
	return &r
}

func (s *SimulationService) randomPelletInput() *model.CreatePelletInput {
	p := simPellets[s.randIntn(len(simPellets))]
	return &p
}

// randomShots produces a plausible 25-shot card biased toward good scores,
// with X-ring hits only on 10s. skill in [0,1] shifts the roll table: higher
// skill yields more 10s and fewer low shots; lower skill introduces occasional
// misses (0-3). 0.5 is the baseline.
func (s *SimulationService) randomShots(skill float64) ([]int16, []bool) {
	scores := make([]int16, 25)
	xs := make([]bool, 25)
	// skill shifts the 10-band and the low-shot band.
	tenBand := 45 + int(skill*25)        // 45..70
	nineBand := tenBand + 30             // 9s take a fixed-ish 30
	lowBand := 100 - (5 + int(skill*10)) // lower skill -> wider low band
	if lowBand < 95 {
		lowBand = 95
	}
	for i := 0; i < 25; i++ {
		roll := s.randIntn(100)
		var score int16
		switch {
		case roll < tenBand:
			score = 10
		case roll < nineBand:
			score = 9
		case roll < lowBand:
			score = 8
		case roll < 98:
			score = 7
		default:
			score = int16(s.randIntn(4)) // 0-3, includes rare misses
		}
		scores[i] = score
		if score == 10 && s.randIntn(100) < 40 {
			xs[i] = true
		}
	}
	return scores, xs
}
