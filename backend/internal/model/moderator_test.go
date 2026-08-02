package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestMemberRoleCan(t *testing.T) {
	tests := []struct {
		name       string
		role       *MemberRole
		permission string
		want       bool
	}{
		{"owner holds everything, even ungranted", &MemberRole{IsOwner: true}, PermManageSettings, true},
		{"granted moderator", &MemberRole{IsModerator: true, Permissions: []string{PermVerifyScores}}, PermVerifyScores, true},
		{"ungranted moderator", &MemberRole{IsModerator: true, Permissions: []string{PermVerifyScores}}, PermManageSettings, false},
		{"plain member with a stale grant", &MemberRole{IsMember: true, Permissions: []string{PermVerifyScores}}, PermVerifyScores, false},
		{"stranger", &MemberRole{}, PermManageMembers, false},
		{"nil role", nil, PermManageMembers, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, tc.role.Can(tc.permission))
		})
	}
}

func TestNormaliseModeratorPermissions(t *testing.T) {
	got := NormaliseModeratorPermissions(LeagueModeratorPermissions, []string{
		PermManageSettings,
		"not_a_capability",
		PermManageMembers,
		PermManageMembers, // duplicate
	})
	// Unknown keys are dropped, duplicates collapse, and the result follows
	// catalogue order so two equivalent grants store identically.
	assert.Equal(t, []string{PermManageMembers, PermManageSettings}, got)
}

func TestNormaliseModeratorPermissionsRejectsCrossDomainKeys(t *testing.T) {
	// manage_seasons is a league capability; a club grant must not accept it.
	got := NormaliseModeratorPermissions(ClubModeratorPermissions, []string{PermManageSeasons, PermManageEvents})
	assert.Equal(t, []string{PermManageEvents}, got)
}

func TestDefaultModeratorPermissionsExcludeTheDangerousOnes(t *testing.T) {
	for _, catalogue := range [][]ModeratorPermission{LeagueModeratorPermissions, ClubModeratorPermissions} {
		defaults := DefaultModeratorPermissions(catalogue)
		assert.NotEmpty(t, defaults, "a fresh moderator should be able to do something")
		assert.NotContains(t, defaults, PermManageModerators, "promotion must not hand out the ability to re-grant")
		assert.NotContains(t, defaults, PermManageSettings, "promotion must not hand out the group's own settings")
		assert.NotContains(t, defaults, PermSendAnnouncements, "promotion must not hand out the megaphone")
		assert.Less(t, len(defaults), len(catalogue), "defaults must leave something for the owner to grant")
	}
}

// Both groups can delegate announcements — a club that runs its own leagues
// and a standalone league both need somebody other than the owner able to
// tell the members something.
func TestBothCataloguesOfferAnnouncements(t *testing.T) {
	for _, catalogue := range [][]ModeratorPermission{LeagueModeratorPermissions, ClubModeratorPermissions} {
		assert.Contains(t, AllModeratorPermissions(catalogue), PermSendAnnouncements)
	}
}

func TestAllModeratorPermissionsCoversTheCatalogue(t *testing.T) {
	all := AllModeratorPermissions(LeagueModeratorPermissions)
	assert.Len(t, all, len(LeagueModeratorPermissions))
	// The owner's implicit grant must satisfy every gate in the catalogue.
	owner := &MemberRole{IsModerator: true, Permissions: all}
	for _, p := range LeagueModeratorPermissions {
		assert.True(t, owner.Can(p.Key), "owner should hold %s", p.Key)
	}
}

func TestCatalogueKeysAreUnique(t *testing.T) {
	for name, catalogue := range map[string][]ModeratorPermission{
		"league": LeagueModeratorPermissions,
		"club":   ClubModeratorPermissions,
	} {
		seen := map[string]bool{}
		for _, p := range catalogue {
			assert.False(t, seen[p.Key], "%s catalogue repeats %s", name, p.Key)
			assert.NotEmpty(t, p.Label, "%s catalogue entry %s needs a label", name, p.Key)
			seen[p.Key] = true
		}
	}
}
