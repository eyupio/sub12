package repository

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

// These exercise moderator role resolution and the delegated capability grant
// against a live PostgreSQL instance. Skipped unless CLUB_DB_TEST=1 is set (see
// clubTestPool).

func TestClubModeratorPermissions(t *testing.T) {
	pool := clubTestPool(t)
	repo := NewClubRepository(pool)
	ctx := context.Background()

	ownerID := newClubTestUser(t, pool, "club-moderator-owner@example.test")
	modID := newClubTestUser(t, pool, "club-moderator-mod@example.test")

	club, err := repo.Create(ctx, ownerID, &model.CreateClubInput{Name: "Delegation Test Club"})
	require.NoError(t, err)
	t.Cleanup(func() { mustExec(t, pool, `DELETE FROM clubs WHERE id = $1`, club.ID) })

	// The creator comes out of Create already resolved as the owner.
	assert.True(t, club.IsOwner)
	assert.True(t, club.IsModerator)
	assert.ElementsMatch(t, model.AllModeratorPermissions(model.ClubModeratorPermissions), club.Permissions)

	require.NoError(t, repo.Join(ctx, club.ID, modID))

	// A plain member holds nothing.
	role, err := repo.GetMemberRole(ctx, club.ID, modID)
	require.NoError(t, err)
	assert.True(t, role.IsMember)
	assert.False(t, role.IsModerator)
	assert.Empty(t, role.Permissions)

	// Promotion grants exactly what was asked for, and nothing else.
	require.NoError(t, repo.PromoteMember(ctx, club.ID, modID,
		[]string{model.PermManageMembers, model.PermModerateContent}))

	role, err = repo.GetMemberRole(ctx, club.ID, modID)
	require.NoError(t, err)
	assert.True(t, role.IsModerator)
	assert.False(t, role.IsOwner)
	assert.ElementsMatch(t, []string{model.PermManageMembers, model.PermModerateContent}, role.Permissions)

	can, err := repo.Can(ctx, club.ID, modID, model.PermManageMembers)
	require.NoError(t, err)
	assert.True(t, can)
	can, err = repo.Can(ctx, club.ID, modID, model.PermManageSettings)
	require.NoError(t, err)
	assert.False(t, can, "a moderator must not hold a capability nobody granted")

	// The owner is never gated by the grant column — their membership row here
	// carries the full set, but even an empty one must resolve to full access.
	mustExec(t, pool, `UPDATE club_members SET moderator_permissions = '{}' WHERE club_id = $1 AND user_id = $2`, club.ID, ownerID)
	can, err = repo.Can(ctx, club.ID, ownerID, model.PermManageSettings)
	require.NoError(t, err)
	assert.True(t, can, "the owner holds every capability without one being granted")

	// Re-granting replaces rather than merges.
	require.NoError(t, repo.SetModeratorPermissions(ctx, club.ID, modID, []string{model.PermManageEvents}))
	role, err = repo.GetMemberRole(ctx, club.ID, modID)
	require.NoError(t, err)
	assert.Equal(t, []string{model.PermManageEvents}, role.Permissions)

	// Demotion clears the grant, so a re-promotion never resurrects it.
	require.NoError(t, repo.DemoteMemberGuarded(ctx, club.ID, modID))
	role, err = repo.GetMemberRole(ctx, club.ID, modID)
	require.NoError(t, err)
	assert.False(t, role.IsModerator)
	assert.Empty(t, role.Permissions)

	// Granting to somebody who is not a moderator is refused outright.
	err = repo.SetModeratorPermissions(ctx, club.ID, modID, []string{model.PermManageEvents})
	assert.ErrorIs(t, err, ErrNotFound)

	// Strangers and missing clubs resolve to the zero role, not an error.
	role, err = repo.GetMemberRole(ctx, club.ID, "00000000-0000-0000-0000-0000000000ff")
	require.NoError(t, err)
	assert.False(t, role.IsMember)
	role, err = repo.GetMemberRole(ctx, "00000000-0000-0000-0000-0000000000ff", ownerID)
	require.NoError(t, err)
	assert.False(t, role.IsMember)
}

func TestClubListMembersReportsOwnerAndGrant(t *testing.T) {
	pool := clubTestPool(t)
	repo := NewClubRepository(pool)
	ctx := context.Background()

	ownerID := newClubTestUser(t, pool, "club-members-owner@example.test")
	modID := newClubTestUser(t, pool, "club-members-mod@example.test")

	club, err := repo.Create(ctx, ownerID, &model.CreateClubInput{Name: "Member Listing Club"})
	require.NoError(t, err)
	t.Cleanup(func() { mustExec(t, pool, `DELETE FROM clubs WHERE id = $1`, club.ID) })
	require.NoError(t, repo.Join(ctx, club.ID, modID))
	require.NoError(t, repo.PromoteMember(ctx, club.ID, modID, []string{model.PermManageMembers}))

	members, err := repo.ListMembers(ctx, club.ID)
	require.NoError(t, err)
	require.Len(t, members, 2)

	// The owner sorts first so the list reads owner, moderators, members.
	assert.Equal(t, ownerID, members[0].UserID)
	assert.True(t, members[0].IsOwner)
	assert.True(t, members[0].IsModerator)

	assert.Equal(t, modID, members[1].UserID)
	assert.False(t, members[1].IsOwner)
	assert.True(t, members[1].IsModerator)
	assert.Equal(t, []string{model.PermManageMembers}, members[1].Permissions)
}

func TestLeagueModeratorPermissions(t *testing.T) {
	pool := clubTestPool(t)
	clubs := NewClubRepository(pool)
	repo := NewLeagueRepository(pool)
	ctx := context.Background()

	ownerID := newClubTestUser(t, pool, "league-moderator-owner@example.test")
	modID := newClubTestUser(t, pool, "league-moderator-mod@example.test")
	_ = clubs

	league, err := repo.Create(ctx, ownerID, &model.CreateLeagueInput{Name: "Delegation Test League", Type: "public"})
	require.NoError(t, err)
	t.Cleanup(func() { mustExec(t, pool, `DELETE FROM leagues WHERE id = $1`, league.ID) })

	role, err := repo.GetMemberRole(ctx, league.ID, ownerID)
	require.NoError(t, err)
	assert.True(t, role.IsOwner)
	assert.ElementsMatch(t, model.AllModeratorPermissions(model.LeagueModeratorPermissions), role.Permissions)

	require.NoError(t, repo.Join(ctx, league.ID, modID))
	require.NoError(t, repo.PromoteMember(ctx, league.ID, modID, []string{model.PermVerifyScores}))

	can, err := repo.Can(ctx, league.ID, modID, model.PermVerifyScores)
	require.NoError(t, err)
	assert.True(t, can)
	can, err = repo.Can(ctx, league.ID, modID, model.PermManageSeasons)
	require.NoError(t, err)
	assert.False(t, can)

	members, err := repo.ListMembers(ctx, league.ID)
	require.NoError(t, err)
	require.Len(t, members, 2)
	assert.True(t, members[0].IsOwner)
	assert.Equal(t, []string{model.PermVerifyScores}, members[1].Permissions)

	// Demotion clears the grant here too. This also guards the lock query:
	// `SELECT COUNT(*) ... FOR UPDATE` is rejected by PostgreSQL, so demoting
	// a league moderator used to fail outright rather than check anything.
	require.NoError(t, repo.DemoteMemberGuarded(ctx, league.ID, modID))
	role, err = repo.GetMemberRole(ctx, league.ID, modID)
	require.NoError(t, err)
	assert.False(t, role.IsModerator)
	assert.Empty(t, role.Permissions)

	// The owner is now the only moderator left, and cannot be demoted away.
	err = repo.DemoteMemberGuarded(ctx, league.ID, ownerID)
	assert.ErrorIs(t, err, ErrLeagueLastAdmin)
	role, err = repo.GetMemberRole(ctx, league.ID, ownerID)
	require.NoError(t, err)
	assert.True(t, role.IsModerator)
}
