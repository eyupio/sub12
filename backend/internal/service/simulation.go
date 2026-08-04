package service

import (
	"context"
	"errors"
	"fmt"
	"hash/fnv"
	"math"
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
	CreateSimulatedUser(ctx context.Context, email, displayName, passwordHash string, createdAt time.Time) (string, error)
	CountSimulatedUsers(ctx context.Context) (int, error)
	IsSimulatedUser(ctx context.Context, userID string) (bool, error)
	CountSimulatedCards(ctx context.Context) (int, error)
	ListSimulatedPersonaSeeds(ctx context.Context, limit int) ([]repository.PersonaSeed, error)
	ListDisplayNames(ctx context.Context) ([]string, error)
	ListSimulatedPersonas(ctx context.Context, limit, offset int) ([]*model.SimulatedPersona, int, error)
	DeleteSimulatedUser(ctx context.Context, id string) error
	DeleteAllSimulated(ctx context.Context) (int, error)
	TrimSimulatedTo(ctx context.Context, target int) (int, error)
	CountCardsForUser(ctx context.Context, userID string) (int, error)
	RandomPublicCard(ctx context.Context, excludeUserID string, simulatedOnly, unlikedOnly bool) (*repository.SimCard, error)
	RandomFollowTarget(ctx context.Context, excludeUserID string, simulatedOnly bool) (string, error)
	RandomFollowBackTarget(ctx context.Context, excludeUserID string, simulatedOnly bool) (string, error)
	RandomMutualFollowTarget(ctx context.Context, excludeUserID string, simulatedOnly bool) (string, error)
	RandomPublicPost(ctx context.Context, excludeUserID string, simulatedOnly, unlikedOnly bool) (string, error)
	RandomActivity(ctx context.Context, excludeUserID string, simulatedOnly, unlikedOnly bool) (string, error)
	RandomFollowedUser(ctx context.Context, followerID string, simulatedOnly bool) (string, error)
	RandomTopLevelComment(ctx context.Context, targetID, targetType, excludeUserID string, simulatedOnly bool) (string, string, error)
	RandomLikeableComment(ctx context.Context, excludeUserID string, simulatedOnly bool) (string, error)
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

// personaTraits is a simulated account's fixed character, derived once from a
// hash of its id so the same account always behaves — and shoots — the same
// way across restarts. Everything a visitor could use to tell one persona from
// another lives here: how well they shoot, how much they talk, how often they
// show up, which ground and discipline they call home, and which of the
// comment voices they write in.
type personaTraits struct {
	skill       float64 // the standard they shoot to, [0,1]
	consistency float64 // how tightly their shots cluster around that standard
	loquacious  float64 // bias toward commenting, and toward replying in threads
	sociable    float64 // bias toward following and sharing
	competitive float64 // bias toward posting cards
	activity    float64 // share of the action budget; cubed, so a few carry most
	voice       int     // which phrasing pool they write comments from
	discipline  string  // home discipline, shot on most cards
	distance    int     // usual distance in metres
	location    string  // home ground, matching their profile location
	indoor      bool    // shoots indoors: no wind, steady temperature
	rifle       int     // index into simRifles
	pellet      int     // index into simPellets
	joined      time.Time
}

// browseSession keeps one persona acting for a short run of consecutive
// actions. Real members arrive, look around, like a few cards, maybe leave a
// comment and go; drawing a fresh random actor for every single action instead
// smears activity evenly across the roster, which no real community does.
type browseSession struct {
	actor     string
	remaining int
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
	// cacheMu protects the persona/trait/gear caches and the browse session.
	cacheMu  sync.Mutex
	personas []string                 // cached simulated user ids
	traits   map[string]personaTraits // cached per-persona character
	gear     map[string]gearIDs       // cached per-persona active rifle/pellet ids
	// recentSaid is the last few comment bodies each persona used, so the same
	// account doesn't repeat itself two cards running.
	recentSaid map[string][]string
	// capped records the personas that have reached max_cards_per_persona, so
	// the engine stops offering them an action they cannot perform, and can
	// tell the admin when the whole roster has run out of cards to shoot.
	// Cleared whenever the persona list is invalidated, which includes every
	// settings save — the cap itself may have moved.
	capped  map[string]bool
	session browseSession
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
		traits:     map[string]personaTraits{},
		gear:       map[string]gearIDs{},
		recentSaid: map[string][]string{},
		capped:     map[string]bool{},
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

// InvalidatePersonas clears the cached persona id list, traits, gear and the
// in-flight browse session so the next batch reloads from the database at the
// current persona_count. The session is dropped too: its actor may be one of
// the accounts that just went away.
func (s *SimulationService) InvalidatePersonas() {
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	s.personas = nil
	s.traits = map[string]personaTraits{}
	s.gear = map[string]gearIDs{}
	s.recentSaid = map[string][]string{}
	s.capped = map[string]bool{}
	s.session = browseSession{}
}

// markCapped records that a persona has reached max_cards_per_persona.
func (s *SimulationService) markCapped(id string) {
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	s.capped[id] = true
}

// isCapped reports whether a persona is known to have reached the card cap.
func (s *SimulationService) isCapped(id string) bool {
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	return s.capped[id]
}

// rosterCapped reports whether every loaded persona has reached the card cap,
// which is the point at which the simulation stops producing score cards for
// good. Nothing else in the engine notices — likes and comments carry on
// churning over the cards that already exist — so this is what turns "enabled,
// ticking, and nothing new on the site" into something the admin can act on.
func (s *SimulationService) rosterCapped(personas []string) bool {
	if len(personas) == 0 {
		return false
	}
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	for _, id := range personas {
		if !s.capped[id] {
			return false
		}
	}
	return true
}

// endSession drops the in-flight browse session so the next actor draw picks
// somebody else. Used when an attempt failed: handing the same persona the
// remaining retries just fails the same way three times over.
func (s *SimulationService) endSession() {
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	s.session = browseSession{}
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
	if in.BackdateDays < 0 || in.BackdateDays > 365 {
		return fmt.Errorf("%w: backdate_days must be between 0 and 365", ErrInvalidSimulationSettings)
	}
	if in.PersonaHistoryDays < 0 || in.PersonaHistoryDays > 3650 {
		return fmt.Errorf("%w: persona_history_days must be between 0 and 3650", ErrInvalidSimulationSettings)
	}
	if in.SessionActions < 1 || in.SessionActions > 20 {
		return fmt.Errorf("%w: session_actions must be between 1 and 20", ErrInvalidSimulationSettings)
	}
	for name, pct := range map[string]int{
		"weekend_bias":    in.WeekendBias,
		"away_day_chance": in.AwayDayChance,
		"reply_chance":    in.ReplyChance,
	} {
		if pct < 0 || pct > 100 {
			return fmt.Errorf("%w: %s must be between 0 and 100", ErrInvalidSimulationSettings, name)
		}
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
// maxPersonasPerProvision per call. Each new account gets a name nobody else on
// the site is using, a join date staggered through the past few months, a rifle
// and pellet, and a bio written from the character its id happens to give it.
// Safe to call without holding s.mu. Returns the number of accounts created.
func (s *SimulationService) EnsurePersonas(ctx context.Context, settings *model.SimulationSettings) (int, error) {
	target := settings.PersonaCount
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

	// Names already on the site, so a new persona never arrives as the second
	// "Alex Fletcher". Best-effort: a failed lookup only costs us the check.
	taken := map[string]bool{}
	if names, err := s.repo.ListDisplayNames(ctx); err != nil {
		s.log.Warn().Err(err).Msg("simulation: list display names failed")
	} else {
		for _, n := range names {
			taken[strings.ToLower(n)] = true
		}
	}

	created := 0
	for i := 0; i < need; i++ {
		name := s.uniqueDisplayName(taken)
		taken[strings.ToLower(name)] = true
		email := fmt.Sprintf("sim-%d-%d@simulated.local", time.Now().UnixNano(), s.randIntn(1_000_000))

		// Simulated accounts are not meant to be logged into; give them an
		// unguessable password hash at minimum cost so the row satisfies
		// NOT NULL without burning CPU.
		hash, err := bcrypt.GenerateFromPassword([]byte(fmt.Sprintf("sim-%d-%d", time.Now().UnixNano(), s.randIntn(1_000_000))), bcrypt.MinCost)
		if err != nil {
			return created, fmt.Errorf("hash simulated password: %w", err)
		}

		userID, err := s.repo.CreateSimulatedUser(ctx, email, name, string(hash), s.joinDate(current+i, target, settings.PersonaHistoryDays))
		if err != nil {
			if errors.Is(err, repository.ErrConflict) {
				continue // email collision, try again next time
			}
			return created, err
		}

		// Provision one active rifle + pellet for the persona so its cards
		// carry gear badges and feed into rifle/pellet stats, then write a
		// profile that matches them. Failures are non-fatal: the persona
		// simply posts without gear, or without a bio.
		s.ensureGear(ctx, userID)
		s.writeProfile(ctx, userID)

		created++
	}
	if created > 0 {
		s.InvalidatePersonas()
	}
	return created, nil
}

// joinDate spreads a roster's join dates back through personaHistoryDays, with
// the index-th persona older than the one after it. A community whose every
// member joined the same afternoon reads as exactly what it is; one that grew
// over months reads as established. Ordering is preserved because
// ListSimulatedPersonaSeeds and TrimSimulatedTo both treat created_at as
// provisioning order.
func (s *SimulationService) joinDate(index, target, historyDays int) time.Time {
	if historyDays <= 0 {
		return time.Now().UTC()
	}
	if target <= 0 {
		target = 1
	}
	if index >= target {
		index = target - 1
	}
	if index < 0 {
		index = 0
	}
	// Oldest member at the far end of the window, newest close to today, with
	// the slot's own width of jitter so the spacing isn't visibly regular.
	slot := float64(historyDays) / float64(target)
	daysBack := float64(historyDays) - float64(index)*slot - s.randFloat(slot)
	if daysBack < 0 {
		daysBack = 0
	}
	return time.Now().UTC().Add(-time.Duration(daysBack * float64(24*time.Hour)))
}

// writeProfile fills in the bio and home location of a freshly created persona
// so the profile a visitor lands on agrees with the cards the persona posts —
// same ground, same discipline, same rifle.
func (s *SimulationService) writeProfile(ctx context.Context, userID string) {
	t := personaTraitsFor(userID, time.Now().UTC())
	bio := personaBio(t)
	location := t.location
	if _, err := s.repo.UpdateSimulatedProfile(ctx, userID, &model.UpdateSimulatedPersonaInput{
		Bio:      &bio,
		Location: &location,
	}); err != nil {
		s.log.Warn().Err(err).Msg("simulation: write persona profile failed")
	}
}

// ensureGear loads the persona's active rifle and pellet, creating whichever
// piece is missing so the account carries gear on its cards like a real user.
// Brand-new personas get both created; existing personas that predate gear
// provisioning (or whose earlier provisioning failed) acquire the missing
// pieces on their next post. Results are cached. Failures are logged and
// swallowed: a persona that still has no gear simply posts without a badge.
func (s *SimulationService) ensureGear(ctx context.Context, userID string) gearIDs {
	s.cacheMu.Lock()
	g := s.gear[userID]
	s.cacheMu.Unlock()

	t := s.personaTraitsOf(userID)
	if g.rifle == "" && s.rifles != nil {
		if rs, err := s.rifles.List(ctx, userID, true); err != nil {
			s.log.Warn().Err(err).Msg("simulation: list rifles failed")
		} else if len(rs) > 0 {
			g.rifle = rs[0].ID
		} else if rifle, err := s.rifles.Create(ctx, userID, personaRifleInput(t)); err != nil {
			s.log.Warn().Err(err).Msg("simulation: create rifle failed")
		} else {
			g.rifle = rifle.ID
		}
	}
	if g.pellet == "" && s.pellets != nil {
		if ps, err := s.pellets.List(ctx, userID, true); err != nil {
			s.log.Warn().Err(err).Msg("simulation: list pellets failed")
		} else if len(ps) > 0 {
			g.pellet = ps[0].ID
		} else if pellet, err := s.pellets.Create(ctx, userID, personaPelletInput(t)); err != nil {
			s.log.Warn().Err(err).Msg("simulation: create pellet failed")
		} else {
			g.pellet = pellet.ID
		}
	}
	s.cacheGear(userID, g)
	return g
}

// cacheGear stores the known gear ids for a persona, filling only the non-empty
// sides so a partial update never clobbers an already-cached id.
func (s *SimulationService) cacheGear(userID string, g gearIDs) {
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	existing := s.gear[userID]
	if g.rifle != "" {
		existing.rifle = g.rifle
	}
	if g.pellet != "" {
		existing.pellet = g.pellet
	}
	s.gear[userID] = existing
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
	if _, err := s.EnsurePersonas(ctx, settings); err != nil {
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
	if _, err := s.EnsurePersonas(ctx, settings); err != nil {
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
			actor := s.nextActor(personas, settings.SessionActions)
			if actor == "" {
				break
			}
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
			// This persona had nothing to give. End their browse session so the
			// retry draws a different one rather than failing identically.
			s.endSession()
		}
	}

	// A roster where every persona has shot its allocation can still like and
	// comment forever, so the counters keep climbing while no new content
	// appears. Say so plainly, and say what to change.
	if performed == 0 && settings.MaxCardsPerPersona > 0 && s.rosterCapped(personas) {
		firstErr = fmt.Sprintf(
			"all %d personas have reached max_cards_per_persona (%d) — no new score cards will be posted; raise the cap, add personas, or set it to 0 for unlimited",
			len(personas), settings.MaxCardsPerPersona)
	}

	if performed > 0 || firstErr != "" {
		if err := s.repo.IncrementCounts(ctx, counts, lastAction, firstErr); err != nil {
			s.log.Warn().Err(err).Msg("simulation: increment counts failed")
		}
	}
	return performed, counts, nil
}

// loadPersonas returns the cached persona id list, reloading from the database
// when the cache is empty. Reloading also caches each persona's join date,
// which bounds how far back their score cards can be dated. When the cached
// list is longer than limit (because persona_count was lowered), it is
// truncated to the oldest limit entries so the engine stops acting on behalf of
// surplus accounts.
func (s *SimulationService) loadPersonas(ctx context.Context, limit int) ([]string, error) {
	if limit <= 0 {
		limit = 1
	}
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	if len(s.personas) == 0 {
		seeds, err := s.repo.ListSimulatedPersonaSeeds(ctx, limit)
		if err != nil {
			return nil, err
		}
		ids := make([]string, 0, len(seeds))
		for _, seed := range seeds {
			ids = append(ids, seed.ID)
			s.traits[seed.ID] = personaTraitsFor(seed.ID, seed.JoinedAt)
		}
		s.personas = ids
		return ids, nil
	}
	if len(s.personas) > limit {
		s.personas = s.personas[:limit]
	}
	return s.personas, nil
}

// Hash salts. Each trait draws from an independent stream keyed off the same
// persona id, so traits stay uncorrelated while remaining stable forever.
const (
	saltSkill = uint64(iota)
	saltLoquacious
	saltSociable
	saltCompetitive
	saltActivity
	saltVoice
	saltDiscipline
	saltDistance
	saltLocation
	saltIndoor
	saltRifle
	saltPellet
	saltConsistency
	saltForm
	saltWind
	saltTemp
)

// personaTraitsFor derives a persona's fixed character from its id. Pure and
// deterministic: the same id always yields the same shooter.
func personaTraitsFor(id string, joined time.Time) personaTraits {
	// Activity is cubed so most personas are quiet and a handful are prolific.
	// A flat distribution would give every account the same visible footprint,
	// which is the one thing no real member roster looks like.
	activity := math.Pow(hashedUnit(id, saltActivity), 3)
	return personaTraits{
		skill:       hashedUnit(id, saltSkill),
		consistency: hashedUnit(id, saltConsistency),
		loquacious:  hashedUnit(id, saltLoquacious),
		sociable:    hashedUnit(id, saltSociable),
		competitive: hashedUnit(id, saltCompetitive),
		activity:    activity,
		voice:       int(hashedUnit(id, saltVoice) * simVoiceCount),
		discipline:  simDisciplines[int(hashedUnit(id, saltDiscipline)*float64(len(simDisciplines)))],
		distance:    simDistances[int(hashedUnit(id, saltDistance)*float64(len(simDistances)))],
		location:    simLocations[int(hashedUnit(id, saltLocation)*float64(len(simLocations)))],
		indoor:      hashedUnit(id, saltIndoor) < 0.2,
		rifle:       int(hashedUnit(id, saltRifle) * float64(len(simRifles))),
		pellet:      int(hashedUnit(id, saltPellet) * float64(len(simPellets))),
		joined:      joined,
	}
}

// personaTraitsOf returns the cached character for a persona, deriving it on
// first use. Personas the cache has never seen (a target picked mid-batch, or
// a test calling in directly) fall back to a join date a month ago.
func (s *SimulationService) personaTraitsOf(id string) personaTraits {
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	return s.traitsLocked(id)
}

// traitsLocked is personaTraitsOf for callers already holding cacheMu.
func (s *SimulationService) traitsLocked(id string) personaTraits {
	if t, ok := s.traits[id]; ok {
		return t
	}
	t := personaTraitsFor(id, time.Now().UTC().AddDate(0, 0, -30))
	if s.traits == nil {
		s.traits = map[string]personaTraits{}
	}
	s.traits[id] = t
	return t
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

// nextActor returns the persona that acts next. An actor keeps the floor for a
// short run of consecutive actions (their browse session) before the engine
// draws the next one, weighted by activity so a keen minority generates most of
// the traffic — the distribution any real community has.
func (s *SimulationService) nextActor(personas []string, maxSessionActions int) string {
	if len(personas) == 0 {
		return ""
	}
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()

	if s.session.remaining > 0 && s.session.actor != "" {
		s.session.remaining--
		return s.session.actor
	}

	actor := s.weightedActorLocked(personas)
	t := s.traitsLocked(actor)
	// A keen member does more in one visit than a lurker who drops in to like
	// one card, so the admin-configured ceiling is scaled by how active this
	// persona is.
	if maxSessionActions < 1 {
		maxSessionActions = 1
	}
	length := 1 + s.randIntn(1+int(float64(maxSessionActions-1)*(0.25+t.activity)))
	s.session = browseSession{actor: actor, remaining: length - 1}
	return actor
}

// weightedActorLocked picks a persona in proportion to its activity trait.
// Caller must hold cacheMu.
func (s *SimulationService) weightedActorLocked(personas []string) string {
	total := 0.0
	for _, id := range personas {
		total += actorWeight(s.traitsLocked(id).activity)
	}
	if total <= 0 {
		return personas[s.randIntn(len(personas))]
	}
	pick := s.randFloat(total)
	for _, id := range personas {
		w := actorWeight(s.traitsLocked(id).activity)
		if pick < w {
			return id
		}
		pick -= w
	}
	return personas[len(personas)-1]
}

// actorWeight converts an activity trait into a selection weight. The floor
// keeps quiet personas from disappearing entirely — a member who posts once a
// month is still part of the community.
func actorWeight(activity float64) float64 {
	return 0.2 + activity*4
}

// pickAction selects an action label by weighted random choice, with the base
// weights biased by the actor's character. A persona already at the card cap is
// never offered "post": drawing an action it cannot perform spends a retry to
// no purpose, and with the cap reached across the roster that is most of the
// budget. Returns "" when the actor has nothing it can do.
func (s *SimulationService) pickAction(settings *model.SimulationSettings, actor string) string {
	p := s.personaTraitsOf(actor)
	type wa struct {
		name   string
		weight float64
	}
	postWeight := float64(settings.PostWeight) * (0.5 + p.competitive)
	if s.isCapped(actor) {
		postWeight = 0
	}
	choices := []wa{
		{"post", postWeight},
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
		// Every weight is zero. That means posting was the only action the admin
		// asked for and this persona can no longer do it — falling back to a like
		// would be doing something nobody configured.
		return ""
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
	case "":
		return actionResult{err: "no action available for persona"}
	case "post":
		return s.doPost(ctx, settings, actor)
	case "comment":
		ok := s.doComment(ctx, settings, actor, simulatedOnly)
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
	posted, err := s.repo.CountCardsForUser(ctx, actor)
	if err != nil {
		s.log.Warn().Err(err).Msg("simulation: count cards failed")
		return actionResult{err: "count cards failed"}
	}
	if settings.MaxCardsPerPersona > 0 && posted >= settings.MaxCardsPerPersona {
		s.markCapped(actor)
		return actionResult{err: "persona at card cap"}
	}

	t := s.personaTraitsOf(actor)
	day := s.sessionDay(t, settings, time.Now().UTC())
	dayKey := day.Format("2006-01-02")

	// Where they were. Mostly their home ground; now and then an away day,
	// which also means a different discipline and distance.
	location, discipline, distance, indoor := t.location, t.discipline, t.distance, t.indoor
	away := s.randIntn(100) < settings.AwayDayChance
	if away {
		location = simLocations[s.randIntn(len(simLocations))]
		discipline = simDisciplines[s.randIntn(len(simDisciplines))]
		distance = simDistances[s.randIntn(len(simDistances))]
		indoor = s.randIntn(100) < 20
	}

	wind, temp := dayConditions(location, day, indoor)
	form := sessionForm(actor, dayKey)
	scores, xs := s.randomShots(cardSkill(t, posted, form, wind), t.consistency)

	var total int16
	for _, sc := range scores {
		total += sc
	}

	visibility := "public"
	input := &model.CreateScoreCardInput{
		ShotAt:      dayKey,
		ShotScores:  scores,
		ShotXs:      xs,
		Visibility:  &visibility,
		Location:    &location,
		Discipline:  &discipline,
		DistanceM:   &distance,
		TempCelsius: &temp,
	}
	if !indoor {
		input.WindMPH = &wind
	}
	if notes := s.cardNote(t, total, wind, indoor, away); notes != "" {
		input.Notes = &notes
	}
	// Attach the persona's active rifle + pellet so cards carry gear badges,
	// provisioning them on the fly if this persona doesn't have any yet.
	gear := s.ensureGear(ctx, actor)
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

// doLike likes a random piece of recent content the persona has not already
// liked. Score cards dominate, but a member who only ever likes cards and never
// a post, a comment or a personal best is recognisably not a member.
func (s *SimulationService) doLike(ctx context.Context, actor string, simulatedOnly bool) bool {
	switch roll := s.randIntn(100); {
	case roll < 20:
		if id, err := s.repo.RandomPublicPost(ctx, actor, simulatedOnly, true); err == nil {
			return s.like(ctx, actor, id, model.LikeTargetPost)
		}
	case roll < 32:
		if id, err := s.repo.RandomActivity(ctx, actor, simulatedOnly, true); err == nil {
			return s.like(ctx, actor, id, model.LikeTargetActivity)
		}
	case roll < 40:
		if id, err := s.repo.RandomLikeableComment(ctx, actor, simulatedOnly); err == nil {
			return s.like(ctx, actor, id, model.LikeTargetComment)
		}
	}
	// Score cards, and the fallback whenever the chosen surface had nothing.
	card, err := s.repo.RandomPublicCard(ctx, actor, simulatedOnly, true)
	if err != nil {
		return false
	}
	return s.like(ctx, actor, card.ID, model.LikeTargetScoreCard)
}

// like reports whether a like was actually created. LikeTx is idempotent, so
// re-liking something returns no error while changing nothing; counting that as
// a performed action is what let total_actions climb steadily on a site where
// nothing was happening.
func (s *SimulationService) like(ctx context.Context, actor, targetID, targetType string) bool {
	created, err := s.likes.Like(ctx, actor, targetID, targetType)
	if err != nil {
		s.log.Warn().Err(err).Str("target_type", targetType).Msg("simulation: like failed")
		return false
	}
	return created
}

// doComment leaves a remark on a randomly chosen score card, post or activity.
// Score cards are weighted heaviest since they dominate public content. Where
// the target already has a conversation on it, a talkative persona will reply
// into that thread rather than adding another disconnected top-level comment —
// threads are most of what makes a comment section look inhabited.
func (s *SimulationService) doComment(ctx context.Context, settings *model.SimulationSettings, actor string, simulatedOnly bool) bool {
	t := s.personaTraitsOf(actor)

	var targetID, targetType string
	var card *repository.SimCard
	switch roll := s.randIntn(10); {
	case roll < 3:
		if id, err := s.repo.RandomPublicPost(ctx, actor, simulatedOnly, false); err == nil {
			targetID, targetType = id, "post"
		}
	case roll < 4:
		if id, err := s.repo.RandomActivity(ctx, actor, simulatedOnly, false); err == nil {
			targetID, targetType = id, "activity"
		}
	}
	if targetID == "" {
		// Score cards, and the fallback when the chosen surface had nothing.
		c, err := s.repo.RandomPublicCard(ctx, actor, simulatedOnly, false)
		if err != nil {
			return false
		}
		card, targetID, targetType = c, c.ID, "score_card"
	}

	// Reply into an existing thread when there is one to reply to.
	var parentID *string
	var body string
	if s.randFloat(1) < replyChance(settings.ReplyChance, t.loquacious) {
		if id, author, err := s.repo.RandomTopLevelComment(ctx, targetID, targetType, actor, simulatedOnly); err == nil {
			parentID = &id
			body = s.replyBody(actor, t, author)
		}
	}
	if body == "" {
		body = s.commentBody(actor, t, card)
	}

	if _, err := s.comments.Create(ctx, targetID, targetType, actor, body, parentID); err != nil {
		s.log.Warn().Err(err).Msg("simulation: comment failed")
		return false
	}
	return true
}

// doFollow follows someone new, preferring the people a real member would
// reach for first: whoever just followed them, then the people their own
// follows follow, and only then a stranger from the directory. Reciprocity and
// friend-of-friend growth are what turn a follow graph into visible clusters
// instead of a uniform random mesh.
func (s *SimulationService) doFollow(ctx context.Context, actor string, simulatedOnly bool) bool {
	finders := []func() (string, error){
		func() (string, error) { return s.repo.RandomFollowBackTarget(ctx, actor, simulatedOnly) },
		func() (string, error) { return s.repo.RandomMutualFollowTarget(ctx, actor, simulatedOnly) },
		func() (string, error) { return s.repo.RandomFollowTarget(ctx, actor, simulatedOnly) },
	}
	// A sociable persona still occasionally follows a stranger outright rather
	// than only ever working the graph it can already see.
	if s.randFloat(1) < strangerFollowChance {
		finders = finders[2:]
	}

	for _, find := range finders {
		targetID, err := find()
		if err != nil || targetID == "" {
			continue
		}
		if _, _, err := s.social.Follow(ctx, actor, targetID); err != nil {
			s.log.Warn().Err(err).Msg("simulation: follow failed")
			return false
		}
		return true
	}
	return false
}

// doUnfollow removes a random follow relationship so the follow graph doesn't
// only ever grow (which would saturate personas and block new follows). The
// repository prefers follows that were never reciprocated — the ones a real
// person is most likely to drop.
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

// doShare creates a share-post referencing a random public score card, with a
// line that reflects how good the card actually is.
func (s *SimulationService) doShare(ctx context.Context, actor string, simulatedOnly bool) bool {
	if s.posts == nil {
		return false
	}
	card, err := s.repo.RandomPublicCard(ctx, actor, simulatedOnly, false)
	if err != nil {
		return false
	}
	in := &model.ShareInput{
		TargetID:   card.ID,
		TargetType: "score_card",
		Body:       s.shareBody(actor, card),
		Visibility: "public",
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

// --- persona character and content ---

const (
	// sessionDecayDays is the mean lag, in days, between shooting a card and
	// logging it. Most cards go up within a few days; a few sit for weeks.
	// The admin-configured backdate_days caps the tail.
	sessionDecayDays = 5.0
	// formWeight is how much a day's form shifts effective skill, and
	// windPenalty how much a full-strength wind takes off it.
	formWeight  = 0.15
	windPenalty = 0.18
	maxWindMPH  = 18.0
	// experienceCards is how many logged cards it takes to reach the full
	// improvement bonus.
	experienceCards = 60.0
	experienceGain  = 0.12
	// replyChanceSpread is how much a persona's talkativeness adds on top of
	// the admin-configured base reply chance.
	replyChanceSpread = 0.35
	// strangerFollowChance is how often a follow skips the reciprocal and
	// friend-of-friend preferences and just picks someone new.
	strangerFollowChance = 0.2
	// simVoiceCount is how many distinct writing voices personas draw from.
	simVoiceCount = 4
	// recentSaidDepth is how many of a persona's most recent lines are
	// remembered and avoided when picking the next one.
	recentSaidDepth = 4
)

// Voices. A community where every member writes in the same register is the
// tell that gives a bot roster away, so each persona is fixed to one of these.
const (
	voiceWarm      = 0 // full sentences, encouraging
	voiceBrief     = 1 // lowercase, clipped, no full stops
	voiceEmoji     = 2 // short and enthusiastic, emoji
	voiceTechnical = 3 // talks gear, wind and numbers
)

var (
	simFirstNames = []string{
		"Alex", "Jordan", "Sam", "Casey", "Riley", "Morgan", "Taylor", "Jamie", "Drew", "Avery",
		"Quinn", "Harper", "Reese", "Skyler", "Cameron", "Rowan", "Emerson", "Finley", "Hayden", "Parker",
		"Dave", "Steve", "Gary", "Neil", "Colin", "Martin", "Trevor", "Ian", "Keith", "Barry",
		"Andy", "Pete", "Nigel", "Graham", "Malcolm", "Derek", "Roy", "Clive", "Stuart", "Wayne",
		"Sue", "Karen", "Lorraine", "Fiona", "Bridget", "Helen", "Angela", "Denise", "Yvonne", "Marie",
		"Owen", "Rhys", "Gareth", "Callum", "Struan", "Eamon", "Padraig", "Niall", "Kirsty", "Morag",
	}
	simLastNames = []string{
		"Fletcher", "Archer", "Marks", "Bell", "Hart", "Reed", "Vance", "Cross", "Lane", "Pike",
		"Frost", "Wren", "Sharpe", "Quill", "Banks", "Drake", "Stone", "Wells", "Knox", "Doyle",
		"Hodgson", "Whittaker", "Pemberton", "Ashworth", "Brindley", "Hargreaves", "Kirkby", "Ollerton",
		"Thwaite", "Rylance", "Sowerby", "Netherwood", "Bircham", "Padgett", "Crowther", "Ferris",
		"Maguire", "Llewellyn", "Bevan", "Urquhart", "Lamont", "Kinsella", "Rafferty", "Tunnicliffe",
	}
	// simHandles are the nickname-style display names a minority of members use
	// instead of a full name.
	simHandles = []string{
		"Springer", "Pellethead", "Sub12", "Bluebottle", "Kneeling", "Windage", "Zeroed", "Plinker",
		"Diabolo", "Chrono", "Featherweight", "Backstop", "Knockdown", "Paperpunch", "Hushpower",
	}
	simLocations = []string{
		"Yorkshire", "Devon", "Kent", "Cumbria", "Surrey", "Norfolk", "Dorset", "Suffolk",
		"Cheshire", "Highlands", "Powys", "Galway", "Cornwall", "Lothian", "Shropshire",
		"Northumberland", "Pembrokeshire", "Lancashire", "Somerset", "Fife",
	}
	simDisciplines = []string{"benchrest", "hft", "ft", "sporter", "field"}
	simDistances   = []int{10, 15, 20, 25, 30, 40, 50}
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

func personaRifleInput(t personaTraits) *model.CreateRifleInput {
	r := simRifles[t.rifle%len(simRifles)]
	return &r
}

func personaPelletInput(t personaTraits) *model.CreatePelletInput {
	p := simPellets[t.pellet%len(simPellets)]
	return &p
}

// uniqueDisplayName builds a name nobody in taken is using. Most members go by
// a full name; a minority use an initial or a handle, the way a real sign-up
// sheet looks. Falls back to appending a digit if the pools are exhausted.
func (s *SimulationService) uniqueDisplayName(taken map[string]bool) string {
	for attempt := 0; attempt < 40; attempt++ {
		first := simFirstNames[s.randIntn(len(simFirstNames))]
		last := simLastNames[s.randIntn(len(simLastNames))]
		var name string
		switch roll := s.randIntn(100); {
		case roll < 62:
			name = first + " " + last
		case roll < 82:
			name = first + " " + last[:1]
		case roll < 92:
			name = simHandles[s.randIntn(len(simHandles))] + first
		default:
			name = first + last[:1] + fmt.Sprintf("%d", 60+s.randIntn(40))
		}
		if !taken[strings.ToLower(name)] {
			return name
		}
	}
	return fmt.Sprintf("%s %d", simFirstNames[s.randIntn(len(simFirstNames))], s.randIntn(10_000))
}

// personaBio writes a profile line that agrees with the persona's discipline,
// ground and rifle, so the bio, the gear list and the score cards all tell the
// same story.
func personaBio(t personaTraits) string {
	rifle := simRifles[t.rifle%len(simRifles)]
	discipline := map[string]string{
		"benchrest": "Benchrest",
		"hft":       "HFT",
		"ft":        "FT",
		"sporter":   "Sporter class",
		"field":     "Field target",
	}[t.discipline]
	if discipline == "" {
		discipline = "Target"
	}
	gear := rifle.Make + " " + rifle.Model
	where := t.location
	if t.indoor {
		where = "indoors in " + t.location
	}

	templates := []string{
		discipline + " shooter, " + where + ". " + gear + " and a lot of patience.",
		gear + " owner. " + discipline + " most weekends, " + where + ".",
		"Shooting " + discipline + " " + where + ". Chasing tighter groups.",
		discipline + " " + where + ". Sub-12 all day, every day.",
		"Weekend " + discipline + " in " + t.location + ". Still learning the " + gear + ".",
		discipline + " at " + fmt.Sprintf("%dm", t.distance) + ", " + where + ".",
	}
	// Deterministic per persona so the bio never contradicts itself if rewritten.
	return templates[int(hashedUnit(t.location+gear+discipline, saltVoice)*float64(len(templates)))%len(templates)]
}

// --- session, form and conditions ---

// sessionDay picks the day a card being logged now was actually shot. Real
// members log after the fact — that evening, or the following Tuesday — and
// they shoot far more at weekends, so the offset decays from today and gets
// pulled back to the weekend just gone. Never earlier than the persona joined.
func (s *SimulationService) sessionDay(t personaTraits, settings *model.SimulationSettings, now time.Time) time.Time {
	if settings.BackdateDays <= 0 {
		return now
	}
	u := s.randFloat(1)
	if u > 0.999 {
		u = 0.999
	}
	off := int(-math.Log(1-u) * sessionDecayDays)
	if off > settings.BackdateDays {
		off = settings.BackdateDays
	}
	day := now.AddDate(0, 0, -off)

	if wd := day.Weekday(); wd != time.Saturday && wd != time.Sunday && s.randIntn(100) < settings.WeekendBias {
		day = day.AddDate(0, 0, -int(wd)) // Mon..Fri step back onto the Sunday
	}

	if joined := t.joined; !joined.IsZero() && day.Before(joined) {
		day = joined
	}
	if day.After(now) {
		day = now
	}
	return day
}

// replyChance is how likely a comment is to join an existing thread: the
// admin-configured base, plus a lift for personas who like to talk. A base of
// zero switches threaded replies off entirely.
func replyChance(basePercent int, loquacious float64) float64 {
	if basePercent <= 0 {
		return 0
	}
	chance := float64(basePercent)/100 + loquacious*replyChanceSpread
	if chance > 1 {
		return 1
	}
	return chance
}

// sessionForm returns how a persona was shooting on a given day, in [-1,1].
// Every card from the same session shares it: a shooter having a bad morning
// has a bad morning across the whole session, and independent draws per card
// are the signature of a random number generator rather than a person.
func sessionForm(personaID, day string) float64 {
	return hashedUnit(personaID+"|"+day, saltForm)*2 - 1
}

// dayConditions returns the wind (mph) and temperature (°C) at a ground on a
// given day. Keyed on place and date, so two members who shot the same county
// on the same Sunday report the same weather — a small coherence a reader
// notices only when it is missing. Indoor sessions are still and mild.
func dayConditions(location string, day time.Time, indoor bool) (wind, temp float64) {
	key := location + "|" + day.Format("2006-01-02")
	if indoor {
		return 0, round1(17 + hashedUnit(key, saltTemp)*4)
	}
	// Squared so calm days are common and a real blow is rare.
	gust := hashedUnit(key, saltWind)
	wind = gust * gust * maxWindMPH
	// UK seasonal curve: coldest mid-January, warmest mid-July, plus the day's
	// own swing.
	seasonal := 10.5 - 7.0*math.Cos(2*math.Pi*(float64(day.YearDay())-15)/365.0)
	temp = seasonal + (hashedUnit(key, saltTemp)-0.5)*9
	return round1(wind), round1(temp)
}

func round1(v float64) float64 { return math.Round(v*10) / 10 }

// cardSkill blends everything that decides how a session goes: the standard the
// persona shoots to, the slow improvement that comes from putting cards in, the
// form they woke up with, and what the wind was doing.
func cardSkill(t personaTraits, cardsPosted int, form, wind float64) float64 {
	skill := t.skill + experienceBonus(cardsPosted) + form*formWeight
	skill -= math.Min(wind, maxWindMPH) / maxWindMPH * windPenalty
	if skill < 0 {
		return 0
	}
	if skill > 1 {
		return 1
	}
	return skill
}

// experienceBonus is the improvement a persona has earned by shooting; it
// plateaus, because nobody keeps improving at the same rate forever.
func experienceBonus(cardsPosted int) float64 {
	if cardsPosted <= 0 {
		return 0
	}
	return math.Min(float64(cardsPosted), experienceCards) / experienceCards * experienceGain
}

// randomShots produces a plausible 25-shot card. skill sets the standard and
// consistency how tightly shots cluster around it: a consistent shooter drops
// the odd 9 where an erratic one of the same standard scatters 7s and the very
// occasional flier. X-ring hits only ever land on a 10, and get more likely the
// better the shooter.
func (s *SimulationService) randomShots(skill, consistency float64) ([]int16, []bool) {
	scores := make([]int16, 25)
	xs := make([]bool, 25)

	// Cumulative percentage bands, 10 down through the miss band.
	ten := 34 + int(skill*34)
	nine := ten + 20 + int(consistency*8)
	eight := nine + maxInt(2, 18-int(skill*12)-int(consistency*4))
	seven := eight + maxInt(1, 8-int(skill*6))
	low := seven + maxInt(0, 12-int(skill*10)) // 4-6; anything past this is a miss
	xChance := 18 + int(skill*40)

	for i := 0; i < 25; i++ {
		roll := s.randIntn(100)
		var score int16
		switch {
		case roll < ten:
			score = 10
		case roll < nine:
			score = 9
		case roll < eight:
			score = 8
		case roll < seven:
			score = 7
		case roll < low:
			score = int16(4 + s.randIntn(3))
		default:
			score = int16(s.randIntn(4)) // 0-3, the rare flier
		}
		scores[i] = score
		if score == 10 && s.randIntn(100) < xChance {
			xs[i] = true
		}
	}
	return scores, xs
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// --- what personas write ---

// cardTier buckets a 25-shot total into the standard it represents, so a
// reaction can fit the card in front of it.
type cardTier int

const (
	tierModest cardTier = iota
	tierSolid
	tierStrong
	tierOutstanding
)

func tierOf(total int16) cardTier {
	switch {
	case total >= 240:
		return tierOutstanding
	case total >= 225:
		return tierStrong
	case total >= 205:
		return tierSolid
	default:
		return tierModest
	}
}

// cardComments[tier][voice] holds the reactions that fit both what was shot and
// who is doing the talking. Praising a 190 the way you'd praise a 246 is the
// fastest way to make a comment section read as automated.
var cardComments = [4][simVoiceCount][]string{
	tierModest: {
		voiceWarm: {
			"Everyone has these. The next one will be better.",
			"Still worth logging — that's how the average comes down.",
			"Been there. Shake it off.",
			"Plenty to build on there.",
			"Honestly, showing up counts for a lot.",
		},
		voiceBrief: {
			"we've all had those",
			"next one mate",
			"still counts",
			"onwards",
			"bad days happen",
		},
		voiceEmoji: {
			"Keep at it 💪",
			"Onwards and upwards 🙂",
			"Next one's yours 🎯",
			"Still logging it, respect 👊",
		},
		voiceTechnical: {
			"Worth checking your hold-over at that range.",
			"Might be worth chronoing before the next session.",
			"Could be the pellet batch — mine went off the boil last month.",
			"What was the wind doing? That'll cost you more than technique.",
		},
	},
	tierSolid: {
		voiceWarm: {
			"Steady card, that.",
			"Nice consistent shooting.",
			"That's a decent day's work.",
			"Good solid session there.",
			"Nothing wrong with that at all.",
		},
		voiceBrief: {
			"tidy",
			"solid that",
			"not bad at all",
			"decent card",
			"good going",
		},
		voiceEmoji: {
			"Nice one 👍",
			"Solid stuff 🎯",
			"Good shooting 🙂",
			"That'll do nicely 👌",
		},
		voiceTechnical: {
			"Good grouping for the conditions.",
			"Consistent through the middle — that's the hard part.",
			"That's a repeatable card, which counts for more than a one-off.",
			"Nice — what head size are you running?",
		},
	},
	tierStrong: {
		voiceWarm: {
			"That's a strong card.",
			"Really nice shooting there.",
			"Very tidy indeed.",
			"That's the standard to aim for.",
			"Excellent stuff, well shot.",
		},
		voiceBrief: {
			"strong card",
			"proper shooting",
			"very tidy",
			"quality",
			"nice one",
		},
		voiceEmoji: {
			"Cracking card 🔥",
			"Lovely shooting 🎯",
			"Class 👏",
			"Superb 💪",
		},
		voiceTechnical: {
			"Groups must be well under an inch at that range.",
			"That's a well-tuned setup, clearly.",
			"Impressive consistency — barely a dropped shot.",
			"That'll be hard to beat this round.",
		},
	},
	tierOutstanding: {
		voiceWarm: {
			"Outstanding. Genuinely.",
			"That's about as good as it gets.",
			"Superb card — well shot indeed.",
			"Take a bow, that's brilliant.",
			"That is seriously impressive shooting.",
		},
		voiceBrief: {
			"blimey",
			"unreal",
			"that's flying",
			"absolute quality",
			"chapeau",
		},
		voiceEmoji: {
			"🔥🔥 Incredible",
			"That's flying 🚀",
			"Wow 🎯🎯",
			"Card of the week that 🏆",
		},
		voiceTechnical: {
			"That's competition standard, that.",
			"Barely anything outside the ten — what pellet?",
			"That X count is doing a lot of talking.",
			"You'd struggle to shoot that indoors, never mind out.",
		},
	},
}

// generalComments are used where there is no card to react to — a post, or an
// activity entry.
var generalComments = [simVoiceCount][]string{
	voiceWarm: {
		"Good to see this.",
		"Couldn't agree more.",
		"Nicely put.",
		"Interesting, thanks for sharing.",
		"That's a fair point, actually.",
	},
	voiceBrief: {
		"agreed",
		"this",
		"same here",
		"good shout",
		"noted",
	},
	voiceEmoji: {
		"Love this 🙌",
		"Yes! 🎯",
		"Great stuff 👏",
		"Bookmarking this 📌",
	},
	voiceTechnical: {
		"Matches what I've found, more or less.",
		"Depends on the pellet, but broadly yes.",
		"Worth testing that over a chrono.",
		"I got the opposite result at 30m, oddly.",
	},
}

// replyLines are what a persona says when it joins an existing thread. The
// {name} slot is filled with whoever it is replying to.
var replyLines = [simVoiceCount][]string{
	voiceWarm: {
		"Well said, {name}.",
		"My thoughts exactly, {name}.",
		"Agreed, {name} — same experience here.",
		"Good point, {name}.",
		"That's it exactly.",
	},
	voiceBrief: {
		"aye",
		"what {name} said",
		"same",
		"yep",
		"this ^",
	},
	voiceEmoji: {
		"Exactly this 👆",
		"{name} gets it 🙌",
		"100% 🎯",
		"Ha, agreed 😄",
	},
	voiceTechnical: {
		"Depends on the range though, {name}.",
		"Found the same, but only in a headwind.",
		"{name} — did you chrono that before or after?",
		"Interesting, mine behaves differently at 40m.",
	},
}

// shareLines are the line attached to a shared card, again keyed on how good
// the card is.
var shareLines = [4][]string{
	tierModest:      {"We've all had days like this.", "Logging the bad ones too.", "Not every card is a good one."},
	tierSolid:       {"Steady stuff, worth a look.", "Nice consistent card here.", "This is the sort of card that wins seasons."},
	tierStrong:      {"Worth a look, this one.", "Cracking card here.", "Someone's been practising."},
	tierOutstanding: {"Look at this one 🔥", "Card of the week, surely.", "This is what we're all chasing.", "Absolutely flying."},
}

// noteLines are what personas write on their own cards, chosen by what the
// session was actually like rather than at random, so the note agrees with the
// wind and the score on the same card.
var noteLines = map[string][]string{
	"windy": {
		"Blowing a hoolie, gave up guessing the wind.",
		"Gusty from the right all session.",
		"Windy. Enough said.",
		"Had to hold off half a mildot most of the way round.",
	},
	"breezy": {
		"Bit of a breeze on the right side.",
		"Light wind, manageable.",
		"Breeze picked up towards the end.",
	},
	"calm": {
		"Calm conditions today.",
		"Still as anything, no excuses.",
		"Perfect conditions, honestly.",
	},
	"indoor": {
		"Indoor session.",
		"Club night indoors.",
		"Indoors, so no excuses.",
	},
	"good": {
		"Really happy with that one.",
		"Best I've shot in a while.",
		"New pellet batch felt good.",
		"Everything just worked today.",
	},
	"bad": {
		"Could've done better on the last few.",
		"Lost concentration halfway through.",
		"One to forget.",
		"Rushed it, and it shows.",
	},
	"away": {
		"Away day, unfamiliar ground.",
		"First time shooting here.",
		"Visiting club, nice setup.",
	},
}

// noteChancePercent is how often a card carries a note at all. Most real cards
// are logged without one.
const noteChancePercent = 45

// cardNote picks a note that fits the session: where they were, what the
// weather did and how it went. Returns "" for the majority of cards.
func (s *SimulationService) cardNote(t personaTraits, total int16, wind float64, indoor, away bool) string {
	if s.randIntn(100) >= noteChancePercent {
		return ""
	}
	var pools []string
	switch {
	case away:
		pools = append(pools, "away")
	case indoor:
		pools = append(pools, "indoor")
	case wind >= 10:
		pools = append(pools, "windy")
	case wind >= 4:
		pools = append(pools, "breezy")
	default:
		pools = append(pools, "calm")
	}
	switch tierOf(total) {
	case tierOutstanding, tierStrong:
		pools = append(pools, "good")
	case tierModest:
		pools = append(pools, "bad")
	}
	pool := noteLines[pools[s.randIntn(len(pools))]]
	if len(pool) == 0 {
		return ""
	}
	return pool[s.randIntn(len(pool))]
}

// commentBody composes a reaction in the persona's own voice that fits what it
// is looking at. card may be nil when the target is a post or an activity.
func (s *SimulationService) commentBody(actor string, t personaTraits, card *repository.SimCard) string {
	voice := t.voice % simVoiceCount
	if card == nil {
		return s.pickFresh(actor, generalComments[voice][:])
	}
	tier := tierOf(card.TotalScore)
	body := s.pickFresh(actor, cardComments[tier][voice][:])
	// Now and then, name the number — the thing a reader does when a card
	// genuinely stands out.
	if tier >= tierStrong && s.randIntn(100) < 25 {
		if card.XCount >= 8 && voice != voiceBrief {
			return fmt.Sprintf("%s %d with %d Xs is serious.", body, card.TotalScore, card.XCount)
		}
		return fmt.Sprintf("%s %d/250 👏", body, card.TotalScore)
	}
	return body
}

// replyBody composes a reply into an existing thread, addressed to whoever
// started it.
func (s *SimulationService) replyBody(actor string, t personaTraits, replyTo string) string {
	line := s.pickFresh(actor, replyLines[t.voice%simVoiceCount][:])
	return strings.ReplaceAll(line, "{name}", firstName(replyTo))
}

// shareBody is the line attached to a shared card.
func (s *SimulationService) shareBody(actor string, card *repository.SimCard) string {
	return s.pickFresh(actor, shareLines[tierOf(card.TotalScore)][:])
}

// firstName trims a display name down to what someone would actually type when
// addressing them in a thread.
func firstName(displayName string) string {
	name := strings.TrimSpace(displayName)
	if i := strings.IndexByte(name, ' '); i > 0 {
		name = name[:i]
	}
	if name == "" {
		return "mate"
	}
	return name
}

// pickFresh draws a line from pool while avoiding the ones this persona used
// most recently, so scrolling a feed never turns up the same account saying the
// same thing twice running. The lookback is capped below the pool size —
// remembering as many lines as the pool holds would leave nothing fresh to pick
// and quietly turn the whole thing back into a uniform draw.
func (s *SimulationService) pickFresh(actor string, pool []string) string {
	if len(pool) == 0 {
		return ""
	}
	recent := s.recentlySaid(actor, recentSaidDepth, len(pool)-1)
	candidates := make([]string, 0, len(pool))
	for _, line := range pool {
		if !recent[line] {
			candidates = append(candidates, line)
		}
	}
	if len(candidates) == 0 {
		candidates = pool
	}
	choice := candidates[s.randIntn(len(candidates))]
	s.remember(actor, choice)
	return choice
}

// recentlySaid returns the set of lines this persona used in its last depth
// draws, where depth is clamped to at most limit.
func (s *SimulationService) recentlySaid(actor string, depth, limit int) map[string]bool {
	if depth > limit {
		depth = limit
	}
	out := map[string]bool{}
	if depth <= 0 {
		return out
	}
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	said := s.recentSaid[actor]
	if len(said) > depth {
		said = said[len(said)-depth:]
	}
	for _, line := range said {
		out[line] = true
	}
	return out
}

func (s *SimulationService) remember(actor, line string) {
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	if s.recentSaid == nil {
		s.recentSaid = map[string][]string{}
	}
	said := append(s.recentSaid[actor], line)
	if len(said) > recentSaidDepth {
		said = said[len(said)-recentSaidDepth:]
	}
	s.recentSaid[actor] = said
}
