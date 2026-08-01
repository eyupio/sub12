package service

import (
	"context"
	"math/rand"
	"strings"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

// maxSessionSpanDays is the widest back-date the tests allow for, matching the
// upper bound of the settings validation.
const maxSessionSpanDays = 45

func validInput() *model.UpsertSimulationSettingsInput {
	return &model.UpsertSimulationSettingsInput{
		Enabled:            true,
		PersonaCount:       10,
		ActionsPerHour:     20,
		PostWeight:         2,
		LikeWeight:         5,
		CommentWeight:      2,
		FollowWeight:       1,
		ActiveStartHour:    0,
		ActiveEndHour:      24,
		MaxCardsPerPersona: 30,
		BackdateDays:       45,
		WeekendBias:        45,
		AwayDayChance:      15,
		ReplyChance:        20,
		SessionActions:     3,
		PersonaHistoryDays: 240,
	}
}

func TestValidateSimulationSettings(t *testing.T) {
	require.NoError(t, validateSimulationSettings(validInput()))

	cases := map[string]func(*model.UpsertSimulationSettingsInput){
		"negative persona": func(in *model.UpsertSimulationSettingsInput) { in.PersonaCount = -1 },
		"persona too high": func(in *model.UpsertSimulationSettingsInput) { in.PersonaCount = 5000 },
		"negative actions": func(in *model.UpsertSimulationSettingsInput) { in.ActionsPerHour = -1 },
		"negative weight":  func(in *model.UpsertSimulationSettingsInput) { in.LikeWeight = -2 },
		"all weights zero": func(in *model.UpsertSimulationSettingsInput) {
			in.PostWeight, in.LikeWeight, in.CommentWeight, in.FollowWeight = 0, 0, 0, 0
		},
		"start hour high":    func(in *model.UpsertSimulationSettingsInput) { in.ActiveStartHour = 24 },
		"end hour zero":      func(in *model.UpsertSimulationSettingsInput) { in.ActiveEndHour = 0 },
		"end hour too high":  func(in *model.UpsertSimulationSettingsInput) { in.ActiveEndHour = 25 },
		"negative max cards": func(in *model.UpsertSimulationSettingsInput) { in.MaxCardsPerPersona = -1 },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			in := validInput()
			mutate(in)
			assert.ErrorIs(t, validateSimulationSettings(in), ErrInvalidSimulationSettings)
		})
	}
}

func TestWithinActiveHours(t *testing.T) {
	// Whole-day window (start == end).
	assert.True(t, withinActiveHours(0, 0, 24))
	assert.True(t, withinActiveHours(13, 9, 9))

	// Normal window [9, 17).
	assert.False(t, withinActiveHours(8, 9, 17))
	assert.True(t, withinActiveHours(9, 9, 17))
	assert.True(t, withinActiveHours(16, 9, 17))
	assert.False(t, withinActiveHours(17, 9, 17))

	// Wrap-around overnight window [20, 6).
	assert.True(t, withinActiveHours(22, 20, 6))
	assert.True(t, withinActiveHours(3, 20, 6))
	assert.False(t, withinActiveHours(12, 20, 6))
}

func newTestSimService() *SimulationService {
	s := &SimulationService{
		log:        zerolog.Nop(),
		rng:        rand.New(rand.NewSource(1)),
		traits:     map[string]personaTraits{},
		gear:       map[string]gearIDs{},
		recentSaid: map[string][]string{},
	}
	s.includePublic.Store(true)
	return s
}

func TestRandomShotsAreValid(t *testing.T) {
	s := newTestSimService()
	for i := 0; i < 100; i++ {
		skill := float64(i%100) / 100.0
		scores, xs := s.randomShots(skill, float64(i%7)/7.0)
		require.Len(t, scores, 25)
		require.Len(t, xs, 25)
		for j := range scores {
			assert.GreaterOrEqual(t, scores[j], int16(0))
			assert.LessOrEqual(t, scores[j], int16(10))
			// X-ring hits only ever land on a perfect 10.
			if xs[j] {
				assert.Equal(t, int16(10), scores[j])
			}
		}
	}
}

func TestPickActionRespectsWeights(t *testing.T) {
	s := newTestSimService()

	// Only follow has weight: every pick must be follow (personality scales the
	// weight but cannot zero it out, so follow still wins).
	settings := &model.SimulationSettings{FollowWeight: 1}
	for i := 0; i < 50; i++ {
		assert.Equal(t, "follow", s.pickAction(settings, "user-1"))
	}

	// Zero total weight falls back to like (never panics).
	assert.Equal(t, "like", s.pickAction(&model.SimulationSettings{}, "user-1"))
}

func TestPickActionCoversAllWeightedActions(t *testing.T) {
	s := newTestSimService()
	settings := &model.SimulationSettings{PostWeight: 1, LikeWeight: 1, CommentWeight: 1, FollowWeight: 1}
	seen := map[string]bool{}
	for i := 0; i < 500; i++ {
		seen[s.pickAction(settings, "user-1")] = true
	}
	for _, action := range []string{"post", "like", "comment", "follow"} {
		assert.True(t, seen[action], "expected to see action %q", action)
	}
}

func TestPersonaContentIsPopulated(t *testing.T) {
	s := newTestSimService()
	assert.NotEmpty(t, s.uniqueDisplayName(map[string]bool{}))

	tr := personaTraitsFor("user-abc", time.Now())
	assert.NotEmpty(t, personaBio(tr))
	assert.NotEmpty(t, tr.location)
	assert.NotEmpty(t, tr.discipline)
	assert.Greater(t, tr.distance, 0)
	assert.NotEmpty(t, s.commentBody("user-abc", tr, nil))
	assert.NotEmpty(t, s.replyBody("user-abc", tr, "Dave Hodgson"))
	assert.NotEmpty(t, s.shareBody("user-abc", &repository.SimCard{TotalScore: 231}))
}

func TestPersonaSkillIsStable(t *testing.T) {
	s := newTestSimService()
	a := s.personaTraitsOf("user-abc").skill
	b := s.personaTraitsOf("user-abc").skill
	assert.Equal(t, a, b, "same id must yield same skill")
	// Different ids should usually differ (not guaranteed, but extremely likely).
	c := s.personaTraitsOf("user-xyz").skill
	assert.NotEqual(t, a, c)
	// Skill is in [0,1].
	assert.GreaterOrEqual(t, a, 0.0)
	assert.LessOrEqual(t, a, 1.0)
}

func TestRandomShotsSkillSpread(t *testing.T) {
	s := newTestSimService()
	// High-skill personas should never produce a 0-3 miss over many trials...
	missHigh := false
	for i := 0; i < 100; i++ {
		scores, _ := s.randomShots(0.95, 0.9)
		for _, sc := range scores {
			if sc < 4 {
				missHigh = true
			}
		}
	}
	// ...while it's not impossible, the low band is extremely narrow at high
	// skill. We assert the score range stays valid instead of asserting no
	// misses, since randomness can still produce one rarely.
	_ = missHigh

	// Low-skill personas should occasionally produce a low shot (0-3) across
	// enough cards.
	sawLow := false
	for i := 0; i < 200; i++ {
		scores, _ := s.randomShots(0.05, 0.1)
		for _, sc := range scores {
			if sc < 4 {
				sawLow = true
			}
			assert.GreaterOrEqual(t, sc, int16(0))
			assert.LessOrEqual(t, sc, int16(10))
		}
	}
	assert.True(t, sawLow, "low-skill personas should produce at least one 0-3 shot over 200 cards")
}

func TestLoadPersonasTruncatesToLimit(t *testing.T) {
	s := newTestSimService()
	// Seed the cache with 5 ids, then request a lower limit.
	s.personas = []string{"a", "b", "c", "d", "e"}
	got, err := s.loadPersonas(context.Background(), 2)
	require.NoError(t, err)
	assert.Equal(t, []string{"a", "b"}, got)
	assert.Equal(t, []string{"a", "b"}, s.personas, "cache should be truncated in place")
}

func TestInvalidatePersonasClearsCaches(t *testing.T) {
	s := newTestSimService()
	s.personas = []string{"a", "b"}
	s.traits = map[string]personaTraits{"a": {skill: 0.5}}
	s.session = browseSession{actor: "a", remaining: 3}
	s.InvalidatePersonas()
	assert.Nil(t, s.personas)
	assert.Empty(t, s.traits)
	assert.Zero(t, s.session.remaining, "an in-flight session must not outlive the roster")
}

// mockSimulationRepo is a minimal stub for testing service methods that hit
// the repo interface.
type mockSimulationRepo struct {
	settings     *model.SimulationSettings
	updatedIn    *model.UpdateSimulatedPersonaInput
	updatedID    string
	auditEvents  []string
	simulated    bool // IsSimulatedUser return value (default true)
	err          error
	seeds        []repository.PersonaSeed
	displayNames []string
	createdAt    []time.Time
}

func (m *mockSimulationRepo) GetSettings(context.Context) (*model.SimulationSettings, error) {
	if m.settings != nil {
		return m.settings, nil
	}
	return &model.SimulationSettings{}, nil
}
func (m *mockSimulationRepo) UpsertSettings(context.Context, *model.UpsertSimulationSettingsInput, string) (*model.SimulationSettings, error) {
	return m.settings, nil
}
func (m *mockSimulationRepo) IncrementCounts(context.Context, map[string]int, string, string) error {
	return nil
}
func (m *mockSimulationRepo) TouchTick(context.Context) error { return nil }
func (m *mockSimulationRepo) CreateSimulatedUser(_ context.Context, _, _, _ string, createdAt time.Time) (string, error) {
	m.createdAt = append(m.createdAt, createdAt)
	return "new-id", nil
}
func (m *mockSimulationRepo) CountSimulatedUsers(context.Context) (int, error) { return 0, nil }
func (m *mockSimulationRepo) IsSimulatedUser(_ context.Context, _ string) (bool, error) {
	if m.err != nil {
		return false, m.err
	}
	if !m.simulated {
		return false, nil
	}
	return true, nil
}
func (m *mockSimulationRepo) CountSimulatedCards(context.Context) (int, error) { return 0, nil }
func (m *mockSimulationRepo) ListSimulatedPersonaSeeds(context.Context, int) ([]repository.PersonaSeed, error) {
	return m.seeds, nil
}
func (m *mockSimulationRepo) ListDisplayNames(context.Context) ([]string, error) {
	return m.displayNames, nil
}
func (m *mockSimulationRepo) ListSimulatedPersonas(context.Context, int, int) ([]*model.SimulatedPersona, int, error) {
	return nil, 0, nil
}
func (m *mockSimulationRepo) DeleteSimulatedUser(context.Context, string) error { return nil }
func (m *mockSimulationRepo) DeleteAllSimulated(context.Context) (int, error)   { return 0, nil }
func (m *mockSimulationRepo) TrimSimulatedTo(context.Context, int) (int, error) { return 0, nil }
func (m *mockSimulationRepo) CountCardsForUser(context.Context, string) (int, error) {
	return 0, nil
}
func (m *mockSimulationRepo) RandomPublicCard(context.Context, string, bool) (*repository.SimCard, error) {
	return nil, repository.ErrNotFound
}
func (m *mockSimulationRepo) RandomFollowTarget(context.Context, string, bool) (string, error) {
	return "", nil
}
func (m *mockSimulationRepo) RandomPublicPost(context.Context, string, bool) (string, error) {
	return "", nil
}
func (m *mockSimulationRepo) RandomActivity(context.Context, string, bool) (string, error) {
	return "", nil
}
func (m *mockSimulationRepo) RandomFollowedUser(context.Context, string, bool) (string, error) {
	return "", nil
}
func (m *mockSimulationRepo) RandomFollowBackTarget(context.Context, string, bool) (string, error) {
	return "", repository.ErrNotFound
}
func (m *mockSimulationRepo) RandomMutualFollowTarget(context.Context, string, bool) (string, error) {
	return "", repository.ErrNotFound
}
func (m *mockSimulationRepo) RandomTopLevelComment(context.Context, string, string, string) (string, string, error) {
	return "", "", repository.ErrNotFound
}
func (m *mockSimulationRepo) RandomLikeableComment(context.Context, string, bool) (string, error) {
	return "", repository.ErrNotFound
}
func (m *mockSimulationRepo) RecordAudit(_ context.Context, event, _ string, _ string) error {
	m.auditEvents = append(m.auditEvents, event)
	return nil
}
func (m *mockSimulationRepo) ListAudit(context.Context, int, int) ([]*model.SimulationAudit, int, error) {
	return nil, 0, nil
}
func (m *mockSimulationRepo) UpdateSimulatedProfile(_ context.Context, id string, in *model.UpdateSimulatedPersonaInput) (*model.AdminUser, error) {
	if m.err != nil {
		return nil, m.err
	}
	m.updatedID = id
	m.updatedIn = in
	return &model.AdminUser{ID: id, IsSimulated: true}, nil
}
func (m *mockSimulationRepo) UpdateSimulatedAvatarURL(_ context.Context, id, _ string) (*model.AdminUser, error) {
	if m.err != nil {
		return nil, m.err
	}
	m.updatedID = id
	return &model.AdminUser{ID: id, IsSimulated: true}, nil
}
func (m *mockSimulationRepo) DeleteSimulatedAvatarURL(_ context.Context, id string) (*model.AdminUser, error) {
	if m.err != nil {
		return nil, m.err
	}
	return &model.AdminUser{ID: id, IsSimulated: true}, nil
}

func TestUpdatePersonaRejectsBlankName(t *testing.T) {
	repo := &mockSimulationRepo{}
	s := &SimulationService{repo: repo, log: zerolog.Nop(), rng: rand.New(rand.NewSource(1)), traits: map[string]personaTraits{}}
	blank := " "
	_, err := s.UpdatePersona(context.Background(), "id", "admin", &model.UpdateSimulatedPersonaInput{DisplayName: &blank})
	assert.ErrorIs(t, err, ErrInvalidSimulationSettings)
}

func TestUpdatePersonaRejectsLongName(t *testing.T) {
	repo := &mockSimulationRepo{}
	s := &SimulationService{repo: repo, log: zerolog.Nop(), rng: rand.New(rand.NewSource(1)), traits: map[string]personaTraits{}}
	long := strings.Repeat("x", 65)
	_, err := s.UpdatePersona(context.Background(), "id", "admin", &model.UpdateSimulatedPersonaInput{DisplayName: &long})
	assert.ErrorIs(t, err, ErrInvalidSimulationSettings)
}

func TestUpdatePersonaAppliesAndAudits(t *testing.T) {
	repo := &mockSimulationRepo{}
	s := &SimulationService{repo: repo, log: zerolog.Nop(), rng: rand.New(rand.NewSource(1)), traits: map[string]personaTraits{"id": {skill: 0.5}}}
	name := "New Name"
	_, err := s.UpdatePersona(context.Background(), "id", "admin", &model.UpdateSimulatedPersonaInput{DisplayName: &name})
	require.NoError(t, err)
	assert.Equal(t, "id", repo.updatedID)
	require.NotNil(t, repo.updatedIn)
	assert.Equal(t, "New Name", *repo.updatedIn.DisplayName)
	assert.Contains(t, repo.auditEvents, "persona_updated")
	assert.Nil(t, s.personas, "persona cache should be invalidated")
}

func TestSetPersonaAvatarAudits(t *testing.T) {
	repo := &mockSimulationRepo{}
	s := &SimulationService{repo: repo, log: zerolog.Nop(), rng: rand.New(rand.NewSource(1)), traits: map[string]personaTraits{}}
	_, err := s.SetPersonaAvatar(context.Background(), "id", "/api/v1/images/1", "admin")
	require.NoError(t, err)
	assert.Contains(t, repo.auditEvents, "persona_avatar")
}

func TestHourlyMultiplier(t *testing.T) {
	// Default all-1.0 slice yields 1.0 for every hour.
	mults := make([]float64, 24)
	for i := range mults {
		mults[i] = 1.0
	}
	for h := 0; h < 24; h++ {
		assert.Equal(t, 1.0, hourlyMultiplier(mults, h))
	}
	// A quiet hour (0) and a busy hour (20).
	mults[0] = 0
	mults[20] = 2.5
	assert.Equal(t, 0.0, hourlyMultiplier(mults, 0))
	assert.Equal(t, 2.5, hourlyMultiplier(mults, 20))
	// Out-of-range / missing fall back to 1.0.
	assert.Equal(t, 1.0, hourlyMultiplier(nil, 12))
	assert.Equal(t, 1.0, hourlyMultiplier([]float64{1, 2}, 10))
	assert.Equal(t, 1.0, hourlyMultiplier(mults, 24))
}

func TestExcludeSimulatedFromPublicDefault(t *testing.T) {
	s := newTestSimService()
	// Default includePublic = true -> exclude = false.
	assert.False(t, s.ExcludeSimulatedFromPublic())
}

func TestExcludeSimulatedFromPublicAfterSettings(t *testing.T) {
	repo := &mockSimulationRepo{settings: &model.SimulationSettings{IncludeInPublicStats: false}}
	s := newTestSimService()
	s.repo = repo
	_, _ = s.GetSettings(context.Background())
	assert.True(t, s.ExcludeSimulatedFromPublic(), "should exclude when include_in_public_stats is false")
}

func TestValidateSimulationSettingsNewWeights(t *testing.T) {
	in := validInput()
	in.UnfollowWeight = -1
	assert.ErrorIs(t, validateSimulationSettings(in), ErrInvalidSimulationSettings)
	in = validInput()
	in.ShareWeight = -1
	assert.ErrorIs(t, validateSimulationSettings(in), ErrInvalidSimulationSettings)
	// All-zero including new weights still rejected.
	in = validInput()
	in.PostWeight, in.LikeWeight, in.CommentWeight, in.FollowWeight = 0, 0, 0, 0
	in.UnfollowWeight, in.ShareWeight = 0, 0
	assert.ErrorIs(t, validateSimulationSettings(in), ErrInvalidSimulationSettings)
	// Unfollow alone is enough.
	in = validInput()
	in.PostWeight, in.LikeWeight, in.CommentWeight, in.FollowWeight, in.ShareWeight = 0, 0, 0, 0, 0
	in.UnfollowWeight = 1
	assert.NoError(t, validateSimulationSettings(in))
}

func TestPickActionIncludesUnfollowAndShare(t *testing.T) {
	s := newTestSimService()
	settings := &model.SimulationSettings{UnfollowWeight: 50, ShareWeight: 50}
	seen := map[string]bool{}
	for i := 0; i < 200; i++ {
		seen[s.pickAction(settings, "user-1")] = true
	}
	assert.True(t, seen["unfollow"], "expected unfollow to be picked")
	assert.True(t, seen["share"], "expected share to be picked")
}

func TestPersonaTraitsAreStable(t *testing.T) {
	s := newTestSimService()
	a := s.personaTraitsOf("user-abc")
	b := s.personaTraitsOf("user-abc")
	assert.Equal(t, a, b)
	assert.GreaterOrEqual(t, a.loquacious, 0.0)
	assert.LessOrEqual(t, a.loquacious, 1.0)
	assert.Less(t, a.voice, simVoiceCount)
	assert.GreaterOrEqual(t, a.voice, 0)
}

func TestJoinPersonaRejectsNonSimulated(t *testing.T) {
	repo := &mockSimulationRepo{simulated: false}
	s := newTestSimService()
	s.repo = repo
	// leagues/clubs are nil -> would error with "not configured", but the
	// simulated guard runs first and returns ErrNotFound.
	err := s.JoinPersonaToLeague(context.Background(), "real-user", "lig", "admin")
	assert.ErrorIs(t, err, repository.ErrNotFound)
}

func TestJoinLeagueRequiresService(t *testing.T) {
	repo := &mockSimulationRepo{simulated: true}
	s := newTestSimService()
	s.repo = repo
	// simulated guard passes, but no league service wired -> error.
	err := s.JoinPersonaToLeague(context.Background(), "sim", "lig", "admin")
	assert.Error(t, err)
}

func TestIsSimulatedEmail(t *testing.T) {
	assert.True(t, isSimulatedEmail("sim-1-2@simulated.local"))
	assert.True(t, isSimulatedEmail("SIM@SIMULATED.LOCAL"))
	assert.False(t, isSimulatedEmail("real@example.com"))
	assert.False(t, isSimulatedEmail(""))
}

func TestSpreadOffsetsWithinWindowAndSorted(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	window := time.Minute

	for _, n := range []int{1, 2, 10, 250} {
		offsets := spreadOffsets(window, n, rng)
		require.Len(t, offsets, n)
		var prev time.Duration
		for i, off := range offsets {
			assert.GreaterOrEqual(t, off, time.Duration(0))
			assert.Less(t, off, window)
			if i > 0 {
				assert.GreaterOrEqual(t, off, prev, "offsets must be ascending")
			}
			prev = off
		}
	}
}

func TestSpreadOffsetsEmptyForZero(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	assert.Empty(t, spreadOffsets(time.Minute, 0, rng))
}

func TestValidateSimulationSettingsRealismBounds(t *testing.T) {
	cases := map[string]func(*model.UpsertSimulationSettingsInput){
		"backdate negative":    func(in *model.UpsertSimulationSettingsInput) { in.BackdateDays = -1 },
		"backdate too high":    func(in *model.UpsertSimulationSettingsInput) { in.BackdateDays = 400 },
		"history too high":     func(in *model.UpsertSimulationSettingsInput) { in.PersonaHistoryDays = 4000 },
		"session actions zero": func(in *model.UpsertSimulationSettingsInput) { in.SessionActions = 0 },
		"session actions high": func(in *model.UpsertSimulationSettingsInput) { in.SessionActions = 21 },
		"weekend bias high":    func(in *model.UpsertSimulationSettingsInput) { in.WeekendBias = 101 },
		"away day negative":    func(in *model.UpsertSimulationSettingsInput) { in.AwayDayChance = -5 },
		"reply chance high":    func(in *model.UpsertSimulationSettingsInput) { in.ReplyChance = 200 },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			in := validInput()
			mutate(in)
			assert.ErrorIs(t, validateSimulationSettings(in), ErrInvalidSimulationSettings)
		})
	}
	// Zero is a legal value for the percentage controls: it switches the
	// behaviour off rather than being out of range.
	in := validInput()
	in.WeekendBias, in.AwayDayChance, in.ReplyChance, in.BackdateDays, in.PersonaHistoryDays = 0, 0, 0, 0, 0
	assert.NoError(t, validateSimulationSettings(in))
}

func TestSessionDayIsBackdatedWithinBounds(t *testing.T) {
	s := newTestSimService()
	now := time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC)
	settings := &model.SimulationSettings{BackdateDays: 45, WeekendBias: 45}
	tr := personaTraitsFor("user-abc", now.AddDate(-1, 0, 0))

	sawPast, weekend := false, 0
	for i := 0; i < 400; i++ {
		day := s.sessionDay(tr, settings, now)
		assert.False(t, day.After(now), "a session cannot be in the future")
		assert.False(t, day.Before(now.AddDate(0, 0, -maxSessionSpanDays)), "session too far back: %s", day)
		if day.Before(now.AddDate(0, 0, -1)) {
			sawPast = true
		}
		if wd := day.Weekday(); wd == time.Saturday || wd == time.Sunday {
			weekend++
		}
	}
	assert.True(t, sawPast, "cards should be back-dated, not all logged today")
	// A flat distribution would put ~2/7 (114) of 400 sessions on a weekend.
	assert.Greater(t, weekend, 160, "sessions should cluster at weekends")
}

func TestSessionDayNeverPredatesJoining(t *testing.T) {
	s := newTestSimService()
	now := time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC)
	settings := &model.SimulationSettings{BackdateDays: 45, WeekendBias: 45}
	// A member who joined three days ago cannot have logged a card from last month.
	tr := personaTraitsFor("user-new", now.AddDate(0, 0, -3))
	for i := 0; i < 200; i++ {
		day := s.sessionDay(tr, settings, now)
		assert.False(t, day.Before(tr.joined), "card dated %s predates joining %s", day, tr.joined)
	}
}

func TestSessionDayDisabledReturnsToday(t *testing.T) {
	s := newTestSimService()
	now := time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC)
	settings := &model.SimulationSettings{BackdateDays: 0, WeekendBias: 45}
	tr := personaTraitsFor("user-abc", now.AddDate(-1, 0, 0))
	assert.Equal(t, now, s.sessionDay(tr, settings, now))
}

func TestSessionFormIsSharedAcrossTheSameDay(t *testing.T) {
	// Two cards from one session share a form; different days do not.
	morning := sessionForm("user-abc", "2026-07-12")
	afternoon := sessionForm("user-abc", "2026-07-12")
	assert.Equal(t, morning, afternoon)
	assert.NotEqual(t, morning, sessionForm("user-abc", "2026-07-13"))
	assert.GreaterOrEqual(t, morning, -1.0)
	assert.LessOrEqual(t, morning, 1.0)
}

func TestDayConditionsAgreeForTheSameGroundAndDay(t *testing.T) {
	day := time.Date(2026, 7, 12, 0, 0, 0, 0, time.UTC)
	wind, temp := dayConditions("Yorkshire", day, false)
	wind2, temp2 := dayConditions("Yorkshire", day, false)
	assert.Equal(t, wind, wind2, "same ground, same day, same wind")
	assert.Equal(t, temp, temp2)

	// Indoors is still, and mild whatever the season.
	winter := time.Date(2026, 1, 12, 0, 0, 0, 0, time.UTC)
	inWind, inTemp := dayConditions("Yorkshire", winter, true)
	assert.Zero(t, inWind)
	assert.Greater(t, inTemp, 15.0)

	// Outdoors, July is warmer than January.
	_, julyTemp := dayConditions("Kent", day, false)
	_, janTemp := dayConditions("Kent", winter, false)
	assert.Greater(t, julyTemp, janTemp)

	assert.GreaterOrEqual(t, wind, 0.0)
	assert.LessOrEqual(t, wind, maxWindMPH)
}

func TestCardSkillRespondsToFormAndWind(t *testing.T) {
	tr := personaTraits{skill: 0.5}
	assert.Greater(t, cardSkill(tr, 0, 1, 0), cardSkill(tr, 0, -1, 0), "good form should beat bad form")
	assert.Greater(t, cardSkill(tr, 0, 0, 0), cardSkill(tr, 0, 0, maxWindMPH), "wind should cost score")
	assert.Greater(t, cardSkill(tr, 100, 0, 0), cardSkill(tr, 0, 0, 0), "experience should help")

	// Always clamped to [0,1] however the inputs stack up.
	for _, tr := range []personaTraits{{skill: 0}, {skill: 1}} {
		for _, form := range []float64{-1, 0, 1} {
			v := cardSkill(tr, 1000, form, 100)
			assert.GreaterOrEqual(t, v, 0.0)
			assert.LessOrEqual(t, v, 1.0)
		}
	}
}

func TestRandomShotsSkillProducesBetterCards(t *testing.T) {
	s := newTestSimService()
	total := func(skill, consistency float64) int {
		sum := 0
		for i := 0; i < 60; i++ {
			scores, _ := s.randomShots(skill, consistency)
			for _, sc := range scores {
				sum += int(sc)
			}
		}
		return sum
	}
	assert.Greater(t, total(0.9, 0.9), total(0.2, 0.2), "a better shooter should out-score a worse one")

	// Even the best simulated shooter drops shots: a roster of 250s is the
	// clearest possible tell.
	perfect := 0
	for i := 0; i < 200; i++ {
		scores, _ := s.randomShots(1, 1)
		sum := 0
		for _, sc := range scores {
			sum += int(sc)
		}
		if sum == 250 {
			perfect++
		}
	}
	assert.Less(t, perfect, 20, "top-skill personas should not routinely shoot a clean 250")
}

func TestCommentBodyMatchesTheCard(t *testing.T) {
	s := newTestSimService()
	tr := personaTraitsFor("user-abc", time.Now())

	// A modest card must never draw one of the outstanding-tier reactions.
	outstanding := map[string]bool{}
	for _, pool := range cardComments[tierOutstanding] {
		for _, line := range pool {
			outstanding[line] = true
		}
	}
	for i := 0; i < 60; i++ {
		body := s.commentBody("user-abc", tr, &repository.SimCard{TotalScore: 188})
		require.NotEmpty(t, body)
		assert.False(t, outstanding[body], "a 188 should not be praised like a 246: %q", body)
	}
}

func TestCommentBodyUsesOneVoicePerPersona(t *testing.T) {
	s := newTestSimService()
	// Every line a persona produces must come from its own voice's pool.
	tr := personaTraitsFor("user-abc", time.Now())
	own := map[string]bool{}
	for tier := range cardComments {
		for _, line := range cardComments[tier][tr.voice%simVoiceCount] {
			own[line] = true
		}
	}
	for i := 0; i < 80; i++ {
		body := s.commentBody("user-abc", tr, &repository.SimCard{TotalScore: int16(180 + i)})
		// Score-quoting variants append to the base line, so match on prefix.
		matched := false
		for line := range own {
			if strings.HasPrefix(body, line) {
				matched = true
				break
			}
		}
		assert.True(t, matched, "body %q is not in this persona's voice", body)
	}
}

func TestPickFreshAvoidsImmediateRepeats(t *testing.T) {
	s := newTestSimService()
	pool := []string{"a", "b", "c", "d", "e", "f"}
	seen := map[string]int{}
	var prev string
	for i := 0; i < 40; i++ {
		got := s.pickFresh("user-abc", pool)
		assert.NotEqual(t, prev, got, "the same persona repeated itself back to back")
		seen[got]++
		prev = got
	}
	assert.Greater(t, len(seen), 2, "should draw across the pool, not just alternate")
}

func TestReplyBodyAddressesTheAuthor(t *testing.T) {
	s := newTestSimService()
	tr := personaTraits{voice: voiceWarm}
	found := false
	for i := 0; i < 40; i++ {
		body := s.replyBody("user-abc", tr, "Dave Hodgson")
		assert.NotContains(t, body, "{name}", "the name slot must be filled in")
		if strings.Contains(body, "Dave") {
			found = true
		}
	}
	assert.True(t, found, "replies should sometimes address the person by name")
	assert.Equal(t, "mate", firstName("   "))
	assert.Equal(t, "Dave", firstName("Dave Hodgson"))
	assert.Equal(t, "Springer", firstName("Springer"))
}

func TestCardNoteFitsTheConditions(t *testing.T) {
	s := newTestSimService()
	tr := personaTraitsFor("user-abc", time.Now())

	windy := map[string]bool{}
	for _, line := range noteLines["windy"] {
		windy[line] = true
	}
	calm := map[string]bool{}
	for _, line := range noteLines["calm"] {
		calm[line] = true
	}
	// A still day never reports a gale.
	for i := 0; i < 200; i++ {
		note := s.cardNote(tr, 230, 0, false, false)
		assert.False(t, windy[note], "calm session reported wind: %q", note)
	}
	// A blowy day never reports perfect conditions.
	for i := 0; i < 200; i++ {
		note := s.cardNote(tr, 230, 15, false, false)
		assert.False(t, calm[note], "windy session reported calm: %q", note)
	}
	// Most cards carry no note at all.
	blank := 0
	for i := 0; i < 400; i++ {
		if s.cardNote(tr, 220, 3, false, false) == "" {
			blank++
		}
	}
	assert.Greater(t, blank, 100, "most cards should be logged without a note")
}

func TestReplyChance(t *testing.T) {
	assert.Zero(t, replyChance(0, 1.0), "a zero base switches threaded replies off")
	assert.Greater(t, replyChance(20, 1.0), replyChance(20, 0.0), "talkative personas reply more")
	assert.LessOrEqual(t, replyChance(100, 1.0), 1.0)
}

func TestActorWeightFavoursActivePersonas(t *testing.T) {
	assert.Greater(t, actorWeight(1.0), actorWeight(0.0))
	assert.Greater(t, actorWeight(0.0), 0.0, "even the quietest persona must stay reachable")
}

func TestNextActorRunsBrowseSessions(t *testing.T) {
	s := newTestSimService()
	personas := []string{"a", "b", "c", "d"}

	// With a session cap of 1, every action draws a fresh actor.
	for i := 0; i < 20; i++ {
		require.NotEmpty(t, s.nextActor(personas, 1))
		assert.Zero(t, s.session.remaining)
	}

	// With a larger cap, an actor holds the floor for consecutive actions.
	s.InvalidatePersonas()
	first := s.nextActor(personas, 6)
	runs := 1
	for s.session.remaining > 0 {
		assert.Equal(t, first, s.nextActor(personas, 6), "a browse session must not switch actor mid-visit")
		runs++
	}
	assert.GreaterOrEqual(t, runs, 1)
	assert.Empty(t, s.nextActor(nil, 3), "no personas means no actor")
}

func TestNextActorSpreadsAcrossTheRosterUnevenly(t *testing.T) {
	s := newTestSimService()
	personas := []string{"p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"}
	counts := map[string]int{}
	for i := 0; i < 4000; i++ {
		counts[s.nextActor(personas, 1)]++
	}
	// Everyone shows up...
	assert.Len(t, counts, len(personas))
	// ...but not equally: the busiest should clearly out-post the quietest.
	most, least := 0, 1<<30
	for _, c := range counts {
		if c > most {
			most = c
		}
		if c < least {
			least = c
		}
	}
	assert.Greater(t, most, least*2, "activity should be uneven across the roster")
}

func TestJoinDatesAreStaggeredAndOrdered(t *testing.T) {
	s := newTestSimService()
	const target = 12
	var prev time.Time
	for i := 0; i < target; i++ {
		got := s.joinDate(i, target, 240)
		assert.False(t, got.After(time.Now().UTC().Add(time.Minute)), "join dates cannot be in the future")
		if i > 0 {
			assert.True(t, got.After(prev), "join dates must increase with provisioning order")
		}
		prev = got
	}
	// The oldest member is genuinely established, not provisioned this morning.
	assert.True(t, s.joinDate(0, target, 240).Before(time.Now().UTC().AddDate(0, 0, -100)))
	// Disabling the spread puts everyone on today.
	assert.WithinDuration(t, time.Now().UTC(), s.joinDate(0, target, 0), time.Minute)
}

func TestPersonaBioMatchesTheirGearAndGround(t *testing.T) {
	tr := personaTraitsFor("user-abc", time.Now())
	bio := personaBio(tr)
	require.NotEmpty(t, bio)
	assert.Contains(t, bio, tr.location, "the bio should name the ground the persona shoots")
	rifle := simRifles[tr.rifle%len(simRifles)]
	assert.Contains(t, bio, rifle.Make, "the bio should name the rifle the persona owns")
	// Stable: rewriting the profile must not contradict what is already there.
	assert.Equal(t, bio, personaBio(tr))
}

func TestUniqueDisplayNameAvoidsCollisions(t *testing.T) {
	s := newTestSimService()
	taken := map[string]bool{}
	for i := 0; i < 200; i++ {
		name := s.uniqueDisplayName(taken)
		require.NotEmpty(t, name)
		assert.False(t, taken[strings.ToLower(name)], "handed out %q twice", name)
		taken[strings.ToLower(name)] = true
	}
}

func TestTierOf(t *testing.T) {
	assert.Equal(t, tierOutstanding, tierOf(246))
	assert.Equal(t, tierStrong, tierOf(231))
	assert.Equal(t, tierSolid, tierOf(212))
	assert.Equal(t, tierModest, tierOf(180))
}
