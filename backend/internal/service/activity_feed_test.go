package service

import (
	"context"
	"errors"
	"testing"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type stubMemberChecker struct {
	member bool
	err    error
}

func (s stubMemberChecker) IsMember(context.Context, string, string) (bool, error) {
	return s.member, s.err
}

// GetFeed's caller-fixable faults must be distinguishable from internal ones:
// the handler maps them to 400 and 403 and echoes their text, while everything
// else becomes a 500 with a fixed message. Before these sentinels existed the
// handler mapped every error to 400 and echoed err.Error(), so a database
// outage answered "400 dial error: host=postgres user=sub12 ..." to the client.
func TestActivityService_GetFeed_RequestFaultsAreTyped(t *testing.T) {
	cases := []struct {
		name    string
		svc     *ActivityService
		req     model.FeedRequest
		wantErr error
	}{
		{
			name:    "league feed without a league id",
			svc:     &ActivityService{},
			req:     model.FeedRequest{Filter: model.FeedLeague, ViewerID: "viewer"},
			wantErr: ErrFeedScopeRequired,
		},
		{
			name:    "club feed without a club id",
			svc:     &ActivityService{},
			req:     model.FeedRequest{Filter: model.FeedClub, ViewerID: "viewer"},
			wantErr: ErrFeedScopeRequired,
		},
		{
			name:    "league feed as a non-member",
			svc:     &ActivityService{leagueMembers: stubMemberChecker{member: false}},
			req:     model.FeedRequest{Filter: model.FeedLeague, LeagueID: "league", ViewerID: "viewer"},
			wantErr: ErrFeedNotMember,
		},
		{
			name:    "club feed as a non-member",
			svc:     &ActivityService{clubMembers: stubMemberChecker{member: false}},
			req:     model.FeedRequest{Filter: model.FeedClub, ClubID: "club", ViewerID: "viewer"},
			wantErr: ErrFeedNotMember,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			feed, err := tc.svc.GetFeed(context.Background(), tc.req)
			require.Error(t, err)
			assert.ErrorIs(t, err, tc.wantErr)
			assert.Nil(t, feed)
		})
	}
}

// A membership lookup that fails for an infrastructure reason is not the
// caller's fault and must not come back as ErrFeedNotMember, or the client is
// told it was refused when in fact nothing was checked.
func TestActivityService_GetFeed_MembershipLookupFailureIsInternal(t *testing.T) {
	boom := errors.New("dial error")
	svc := &ActivityService{leagueMembers: stubMemberChecker{err: boom}}

	feed, err := svc.GetFeed(context.Background(), model.FeedRequest{
		Filter: model.FeedLeague, LeagueID: "league", ViewerID: "viewer",
	})

	require.Error(t, err)
	assert.ErrorIs(t, err, boom)
	assert.NotErrorIs(t, err, ErrFeedNotMember)
	assert.NotErrorIs(t, err, ErrFeedScopeRequired)
	assert.Nil(t, feed)
}
