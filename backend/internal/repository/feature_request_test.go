package repository

import (
	"context"
	"fmt"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

// Database-backed tests for the feature board. The board reads its rows through
// one enriched query (scope name, requester, counts) and writes a history entry
// per change, both of which only really hold up against Postgres. Skipped
// unless DB_HOST is set — CI's backend job provides one.

func newFeatureTicket(t *testing.T, pool *pgxpool.Pool, requesterID, scopeType string, scopeID *string, priority string) string {
	t.Helper()
	var id string
	err := pool.QueryRow(context.Background(), `
		INSERT INTO support_tickets (requester_id, scope_type, scope_id, category, title, description, priority)
		VALUES ($1, $2, $3, 'feature', 'Ticket title', 'Ticket description', $4)
		RETURNING id
	`, requesterID, scopeType, scopeID, priority).Scan(&id)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM support_tickets WHERE id = $1`, id)
	})
	return id
}

func newFeatureLeague(t *testing.T, pool *pgxpool.Pool, ownerID, name string) string {
	t.Helper()
	var id string
	err := pool.QueryRow(context.Background(),
		`INSERT INTO leagues (name, created_by) VALUES ($1, $2) RETURNING id`, name, ownerID).Scan(&id)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM leagues WHERE id = $1`, id)
	})
	return id
}

func TestFeatureRequestCreateFromTicketEnrichesAndRecordsOrigin(t *testing.T) {
	pool := testPool(t)
	repo := NewFeatureRequestRepository(pool)
	ctx := context.Background()

	requester := newTestUser(t, pool, "fr-requester", testName(t, "requester"))
	admin := newTestUser(t, pool, "fr-admin", testName(t, "admin"))
	leagueID := newFeatureLeague(t, pool, requester, testName(t, "league"))
	ticketID := newFeatureTicket(t, pool, requester, model.SupportScopeLeague, &leagueID, model.SupportPriorityHigh)

	ticket := &model.SupportTicket{
		ID:        ticketID,
		ScopeType: model.SupportScopeLeague,
		ScopeID:   &leagueID,
		Priority:  model.SupportPriorityHigh,
	}
	item, err := repo.CreateFromTicket(ctx, ticket, admin, &model.CreateFeatureRequestFromTicketInput{
		Title:              "Side-by-side pellet tests",
		RefinedDescription: "Compare two tests at once.",
	})
	require.NoError(t, err)

	// The board renders names, never IDs — they have to come back on the row.
	require.Equal(t, testName(t, "requester"), item.RequesterName)
	require.Equal(t, requester, item.RequesterID)
	require.NotNil(t, item.ScopeName)
	require.Equal(t, testName(t, "league"), *item.ScopeName)
	require.Equal(t, model.SupportScopeLeague, item.ScopeType)
	// The requester's stated urgency carries onto the board.
	require.Equal(t, model.FeatureRequestPriorityHigh, item.Priority)
	require.Equal(t, model.FeatureRequestStatusRefining, item.Status)
	require.Equal(t, 0, item.VoteCount)
	require.Equal(t, 0, item.CommentCount)

	events, err := repo.ListEvents(ctx, item.ID)
	require.NoError(t, err)
	require.Len(t, events, 1)
	require.Equal(t, model.FeatureRequestEventCreated, events[0].EventType)
	require.NotNil(t, events[0].ToValue)
	require.Equal(t, model.FeatureRequestStatusRefining, *events[0].ToValue)

	// Re-running the conversion updates in place rather than minting a second
	// origin event.
	_, err = repo.CreateFromTicket(ctx, ticket, admin, &model.CreateFeatureRequestFromTicketInput{
		Title:              "Side-by-side pellet tests",
		RefinedDescription: "Reworded.",
	})
	require.NoError(t, err)
	events, err = repo.ListEvents(ctx, item.ID)
	require.NoError(t, err)
	require.Len(t, events, 1)
}

func TestFeatureRequestUpdateRecordsOnlyRealTransitions(t *testing.T) {
	pool := testPool(t)
	repo := NewFeatureRequestRepository(pool)
	ctx := context.Background()

	requester := newTestUser(t, pool, "fr2-requester", testName(t, "requester"))
	admin := newTestUser(t, pool, "fr2-admin", testName(t, "admin"))
	ticketID := newFeatureTicket(t, pool, requester, model.SupportScopePlatform, nil, model.SupportPriorityNormal)

	item, err := repo.CreateFromTicket(ctx, &model.SupportTicket{
		ID:        ticketID,
		ScopeType: model.SupportScopePlatform,
		Priority:  model.SupportPriorityNormal,
	}, admin, &model.CreateFeatureRequestFromTicketInput{Title: "Dark mode"})
	require.NoError(t, err)

	planned := model.FeatureRequestStatusPlanned
	urgent := model.FeatureRequestPriorityUrgent
	updated, err := repo.Update(ctx, item.ID, &model.UpdateFeatureRequestInput{
		Status:   &planned,
		Priority: &urgent,
	}, admin)
	require.NoError(t, err)
	require.Equal(t, planned, updated.Status)
	require.Equal(t, urgent, updated.Priority)

	// Writing the same values again must not add noise to the timeline.
	_, err = repo.Update(ctx, item.ID, &model.UpdateFeatureRequestInput{Status: &planned, Priority: &urgent}, admin)
	require.NoError(t, err)

	events, err := repo.ListEvents(ctx, item.ID)
	require.NoError(t, err)
	types := make([]string, 0, len(events))
	for _, e := range events {
		types = append(types, e.EventType)
	}
	require.Equal(t, []string{
		model.FeatureRequestEventCreated,
		model.FeatureRequestEventStatusChanged,
		model.FeatureRequestEventPriorityChanged,
	}, types)
	require.NotNil(t, events[1].FromValue)
	require.Equal(t, model.FeatureRequestStatusRefining, *events[1].FromValue)
	require.NotNil(t, events[1].ActorName)
	require.Equal(t, testName(t, "admin"), *events[1].ActorName)
}

func TestFeatureRequestListRankedCountsVotesAndComments(t *testing.T) {
	pool := testPool(t)
	repo := NewFeatureRequestRepository(pool)
	ctx := context.Background()

	requester := newTestUser(t, pool, "fr3-requester", testName(t, "requester"))
	voter := newTestUser(t, pool, "fr3-voter", testName(t, "voter"))

	created := make([]*model.FeatureRequest, 0, 2)
	for i, title := range []string{"Quiet idea", "Popular idea"} {
		ticketID := newFeatureTicket(t, pool, requester, model.SupportScopePlatform, nil, model.SupportPriorityNormal)
		item, err := repo.CreateFromTicket(ctx, &model.SupportTicket{
			ID:        ticketID,
			ScopeType: model.SupportScopePlatform,
			Priority:  model.SupportPriorityNormal,
		}, requester, &model.CreateFeatureRequestFromTicketInput{Title: fmt.Sprintf("%s %s", testName(t, "idea"), title)})
		require.NoError(t, err)
		created = append(created, item)
		_ = i
	}
	quiet, popular := created[0], created[1]

	require.NoError(t, repo.AddVote(ctx, popular.ID, requester))
	require.NoError(t, repo.AddVote(ctx, popular.ID, voter))
	// A repeat vote from the same person must not inflate the count.
	require.NoError(t, repo.AddVote(ctx, popular.ID, voter))
	_, err := pool.Exec(ctx, `
		INSERT INTO comments (user_id, target_id, target_type, body)
		VALUES ($1, $2, 'feature_request', 'Yes please')
	`, voter, popular.ID)
	require.NoError(t, err)

	items, err := repo.ListRanked(ctx, &model.ListFeatureRequestsInput{ViewerID: voter, ScopeType: model.SupportScopePlatform, Limit: 200})
	require.NoError(t, err)

	byID := map[string]*model.FeatureRequest{}
	order := []string{}
	for _, item := range items {
		byID[item.ID] = item
		order = append(order, item.ID)
	}
	require.Contains(t, byID, popular.ID)
	require.Contains(t, byID, quiet.ID)
	require.Equal(t, 2, byID[popular.ID].VoteCount)
	require.Equal(t, 1, byID[popular.ID].CommentCount)
	require.True(t, byID[popular.ID].ViewerHasVoted)
	require.Equal(t, 0, byID[quiet.ID].VoteCount)
	require.False(t, byID[quiet.ID].ViewerHasVoted)
	require.Less(t, indexOf(order, popular.ID), indexOf(order, quiet.ID), "ranked list puts the most-voted idea first")

	// An anonymous read (empty viewer) must not trip the uuid comparison.
	anon, err := repo.GetByID(ctx, popular.ID, "")
	require.NoError(t, err)
	require.False(t, anon.ViewerHasVoted)

	require.NoError(t, repo.RemoveVote(ctx, popular.ID, voter))
	after, err := repo.GetByID(ctx, popular.ID, voter)
	require.NoError(t, err)
	require.Equal(t, 1, after.VoteCount)
	require.False(t, after.ViewerHasVoted)
}

func indexOf(values []string, want string) int {
	for i, v := range values {
		if v == want {
			return i
		}
	}
	return -1
}
