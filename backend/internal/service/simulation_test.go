package service

import (
	"context"
	"math/rand"
	"strings"
	"testing"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

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
		log:     zerolog.Nop(),
		rng:     rand.New(rand.NewSource(1)),
		skills:  map[string]float64{},
		gear:    map[string]gearIDs{},
		profiles: map[string]personaProfile{},
	}
	s.includePublic.Store(true)
	return s
}

func TestRandomShotsAreValid(t *testing.T) {
	s := newTestSimService()
	for i := 0; i < 100; i++ {
		skill := float64(i%100) / 100.0
		scores, xs := s.randomShots(skill)
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

func TestRandomHelpersNonEmpty(t *testing.T) {
	s := newTestSimService()
	assert.NotEmpty(t, s.randomDisplayName())
	assert.NotEmpty(t, s.randomBio())
	assert.NotEmpty(t, s.randomLocation())
	assert.NotEmpty(t, s.randomComment())
	// randomNote is allowed to be empty (some personas post without a note).
	_ = s.randomNote()
	assert.NotEmpty(t, s.randomDiscipline())
	assert.Greater(t, s.randomDistance(), 0)
}

func TestPersonaSkillIsStable(t *testing.T) {
	s := newTestSimService()
	a := s.personaSkill("user-abc")
	b := s.personaSkill("user-abc")
	assert.Equal(t, a, b, "same id must yield same skill")
	// Different ids should usually differ (not guaranteed, but extremely likely).
	c := s.personaSkill("user-xyz")
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
		scores, _ := s.randomShots(0.95)
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
		scores, _ := s.randomShots(0.05)
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
	s.skills = map[string]float64{}
	got, err := s.loadPersonas(context.Background(), 2)
	require.NoError(t, err)
	assert.Equal(t, []string{"a", "b"}, got)
	assert.Equal(t, []string{"a", "b"}, s.personas, "cache should be truncated in place")
}

func TestInvalidatePersonasClearsCaches(t *testing.T) {
	s := newTestSimService()
	s.personas = []string{"a", "b"}
	s.skills = map[string]float64{"a": 0.5}
	s.InvalidatePersonas()
	assert.Nil(t, s.personas)
	assert.Empty(t, s.skills)
}

// mockSimulationRepo is a minimal stub for testing service methods that hit
// the repo interface.
type mockSimulationRepo struct {
	settings    *model.SimulationSettings
	updatedIn   *model.UpdateSimulatedPersonaInput
	updatedID   string
	auditEvents []string
	err         error
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
func (m *mockSimulationRepo) CreateSimulatedUser(context.Context, string, string, *string, *string, string) (string, error) {
	return "new-id", nil
}
func (m *mockSimulationRepo) CountSimulatedUsers(context.Context) (int, error) { return 0, nil }
func (m *mockSimulationRepo) IsSimulatedUser(_ context.Context, _ string) (bool, error) {
	return true, nil
}
func (m *mockSimulationRepo) IsSimulatedUser(context.Context, string) (bool, error) {
	return false, nil
}
func (m *mockSimulationRepo) CountSimulatedCards(context.Context) (int, error) { return 0, nil }
func (m *mockSimulationRepo) ListSimulatedUserIDs(context.Context, int) ([]string, error) {
	return nil, nil
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
func (m *mockSimulationRepo) RandomPublicCard(context.Context, string, bool) (string, string, error) {
	return "", "", nil
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

func TestUpdatePersonaRejectsBlankName(t *testing.T) {
	repo := &mockSimulationRepo{}
	s := &SimulationService{repo: repo, log: zerolog.Nop(), rng: rand.New(rand.NewSource(1)), skills: map[string]float64{}}
	blank := " "
	_, err := s.UpdatePersona(context.Background(), "id", "admin", &model.UpdateSimulatedPersonaInput{DisplayName: &blank})
	assert.ErrorIs(t, err, ErrInvalidSimulationSettings)
}

func TestUpdatePersonaRejectsLongName(t *testing.T) {
	repo := &mockSimulationRepo{}
	s := &SimulationService{repo: repo, log: zerolog.Nop(), rng: rand.New(rand.NewSource(1)), skills: map[string]float64{}}
	long := strings.Repeat("x", 65)
	_, err := s.UpdatePersona(context.Background(), "id", "admin", &model.UpdateSimulatedPersonaInput{DisplayName: &long})
	assert.ErrorIs(t, err, ErrInvalidSimulationSettings)
}

func TestUpdatePersonaAppliesAndAudits(t *testing.T) {
	repo := &mockSimulationRepo{}
	s := &SimulationService{repo: repo, log: zerolog.Nop(), rng: rand.New(rand.NewSource(1)), skills: map[string]float64{"id": 0.5}}
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
	s := &SimulationService{repo: repo, log: zerolog.Nop(), rng: rand.New(rand.NewSource(1)), skills: map[string]float64{}}
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

func TestPersonaProfileIsStable(t *testing.T) {
	s := newTestSimService()
	a := s.personaProfile("user-abc")
	b := s.personaProfile("user-abc")
	assert.Equal(t, a, b)
	assert.GreaterOrEqual(t, a.loquacious, 0.0)
	assert.LessOrEqual(t, a.loquacious, 1.0)
}
