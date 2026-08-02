package service

import (
	"strings"
	"testing"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

func TestNotificationEmailContent_AllTypes(t *testing.T) {
	cases := []struct {
		name        string
		ev          NotifEvent
		actor       string
		wantSubject string
		bodyMustHas []string
	}{
		{"follow_request_named", NotifEvent{Type: model.NotificationTypeFollowRequest}, "Alice", "New follow request on sub12.io", []string{"Alice", "follow you", "sub12.io"}},
		{"follow_request_anon", NotifEvent{Type: model.NotificationTypeFollowRequest}, "", "New follow request on sub12.io", []string{"Someone", "sub12.io"}},
		{"follow_accepted", NotifEvent{Type: model.NotificationTypeFollowAccepted}, "Bob", "New follower on sub12.io", []string{"Bob", "following you", "sub12.io"}},
		{"comment", NotifEvent{Type: model.NotificationTypeCommentOnCard}, "Carol", "New comment on your score card", []string{"Carol", "score card"}},
		{"reply", NotifEvent{Type: model.NotificationTypeReplyToMyComment}, "Dan", "New reply to your comment", []string{"Dan", "replied"}},
		{"like", NotifEvent{Type: model.NotificationTypeLikeOnMyContent}, "Eve", "Someone liked your content", []string{"Eve", "liked", "sub12.io"}},
		{"verified", NotifEvent{Type: model.NotificationTypeScoreVerified}, "", "Your score was verified", []string{"verified"}},
		{"rejected", NotifEvent{Type: model.NotificationTypeScoreRejected}, "", "Your score was rejected", []string{"rejected"}},
		{"amended", NotifEvent{Type: model.NotificationTypeScoreAmended}, "", "Your score was amended", []string{"amended"}},
		{"league_join", NotifEvent{Type: model.NotificationTypeLeagueJoinApproved}, "", "League join approved", []string{"league", "approved"}},
		{"club_join", NotifEvent{Type: model.NotificationTypeClubJoinApproved}, "", "Club join approved", []string{"club", "approved"}},
		{"mention", NotifEvent{Type: model.NotificationTypeMention}, "Frank", "You were mentioned on sub12.io", []string{"Frank", "mentioned", "sub12.io"}},
		{"ticket_created", NotifEvent{Type: model.NotificationTypeTicketCreated}, "Grace", "New support ticket", []string{"Grace", "created", "support ticket"}},
		{"ticket_replied", NotifEvent{Type: model.NotificationTypeTicketReplied}, "Hank", "New reply on a support ticket", []string{"Hank", "replied", "support ticket"}},
		{"ticket_assigned", NotifEvent{Type: model.NotificationTypeTicketAssigned}, "Ivy", "Support ticket assigned to you", []string{"Ivy", "assigned", "support ticket"}},
		{"ticket_status", NotifEvent{Type: model.NotificationTypeTicketStatusChanged}, "Jake", "Support ticket status updated", []string{"Jake", "updated", "status"}},
		{"feature_state", NotifEvent{Type: model.NotificationTypeFeatureRequestStateChanged}, "Kim", "Feature request status updated", []string{"Kim", "feature request", "updated"}},
		{"validation_league", NotifEvent{Type: model.NotificationTypeScoreValidationRequested, Metadata: map[string]any{"league_name": "Sunday Bench"}}, "Liam", "A score card needs validating", []string{"Liam", "validated", "in Sunday Bench"}},
		{"validation_personal", NotifEvent{Type: model.NotificationTypeScoreValidationRequested}, "Mia", "A score card needs validating", []string{"Mia", "validated"}},
		{"league_join_request", NotifEvent{Type: model.NotificationTypeLeagueJoinRequest, Metadata: map[string]any{"league_name": "Sunday Bench"}}, "Noah", "New league join request", []string{"Noah", "asked to join", "Sunday Bench"}},
		{"league_join_rejected", NotifEvent{Type: model.NotificationTypeLeagueJoinRejected}, "", "League join request declined", []string{"declined", "a league"}},
		{"league_promoted", NotifEvent{Type: model.NotificationTypeLeagueRoleChanged, Metadata: map[string]any{"is_moderator": true, "league_name": "Sunday Bench"}}, "Olive", "You now help run a league", []string{"moderator", "Sunday Bench"}},
		{"league_demoted", NotifEvent{Type: model.NotificationTypeLeagueRoleChanged, Metadata: map[string]any{"is_moderator": false}}, "Olive", "Your league role changed", []string{"no longer a moderator"}},
		{"league_round", NotifEvent{Type: model.NotificationTypeLeagueRoundOpened, Metadata: map[string]any{"league_name": "Sunday Bench"}}, "", "A new league round is open", []string{"new round", "Sunday Bench"}},
		{"club_join_request", NotifEvent{Type: model.NotificationTypeClubJoinRequest, Metadata: map[string]any{"club_name": "Dales RC"}}, "Pip", "New club join request", []string{"Pip", "asked to join", "Dales RC"}},
		{"club_join_rejected", NotifEvent{Type: model.NotificationTypeClubJoinRejected}, "", "Club join request declined", []string{"declined", "a club"}},
		{"club_promoted", NotifEvent{Type: model.NotificationTypeClubRoleChanged, Metadata: map[string]any{"is_moderator": true, "club_name": "Dales RC"}}, "Quinn", "You now help run a club", []string{"moderator", "Dales RC"}},
		{"club_demoted", NotifEvent{Type: model.NotificationTypeClubRoleChanged}, "Quinn", "Your club role changed", []string{"no longer a moderator"}},
		{"event_invitation", NotifEvent{Type: model.NotificationTypeEventInvitation, Metadata: map[string]any{"event_name": "Winter Open"}}, "Rae", "You're invited to an event", []string{"Rae", "invited you", "Winter Open"}},
		{"event_entry", NotifEvent{Type: model.NotificationTypeEventParticipantJoined, Metadata: map[string]any{"event_name": "Winter Open"}}, "Sam", "New entry for your event", []string{"Sam", "entered", "Winter Open"}},
		{"event_live", NotifEvent{Type: model.NotificationTypeEventWentLive, Metadata: map[string]any{"event_name": "Winter Open"}}, "", "An event has gone live", []string{"Winter Open", "now live"}},
		{"event_results", NotifEvent{Type: model.NotificationTypeEventResultsPosted, Metadata: map[string]any{"event_name": "Winter Open"}}, "", "Event results are in", []string{"results", "Winter Open", "posted"}},
		{"unknown", NotifEvent{Type: "made_up_type"}, "", "New sub12.io notification", []string{"new notification", "sub12.io"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			subject, body := notificationEmailContent(tc.ev, tc.actor)
			if subject != tc.wantSubject {
				t.Errorf("subject: got %q, want %q", subject, tc.wantSubject)
			}
			lower := strings.ToLower(body)
			for _, needle := range tc.bodyMustHas {
				if !strings.Contains(lower, strings.ToLower(needle)) {
					t.Errorf("body %q missing substring %q", body, needle)
				}
			}
		})
	}
}

// An announcement's own words are the notification: the title becomes the
// subject/push title and the trimmed body the message.
func TestNotificationEmailContent_Announcement(t *testing.T) {
	subject, body := notificationEmailContent(NotifEvent{
		Type:     model.NotificationTypeAnnouncement,
		Metadata: map[string]any{"title": "Range closed Sunday", "body_preview": "Gates locked all day."},
	}, "Tess")
	if subject != "Range closed Sunday" {
		t.Errorf("subject: got %q, want the announcement title", subject)
	}
	if body != "Gates locked all day." {
		t.Errorf("body: got %q, want the announcement preview", body)
	}

	// A row written before the metadata existed still reads as a sentence.
	subject, body = notificationEmailContent(NotifEvent{Type: model.NotificationTypeAnnouncement}, "Tess")
	if subject != "New announcement" || !strings.Contains(body, "Tess") {
		t.Errorf("fallback: got %q / %q", subject, body)
	}
}

// The metadata key an announcement's group name travels under has to be the
// one the client already reads group names from, or the bell renders an
// announcement without saying which league it came from.
func TestScopeNameKey(t *testing.T) {
	cases := map[string]string{
		model.AnnouncementScopeLeague:   "league_name",
		model.AnnouncementScopeClub:     "club_name",
		model.AnnouncementScopeEvent:    "event_name",
		model.AnnouncementScopePlatform: "scope_name",
	}
	for scope, want := range cases {
		if got := scopeNameKey(scope); got != want {
			t.Errorf("scopeNameKey(%q) = %q, want %q", scope, got, want)
		}
	}
}

// The invitation email carries the accept link and is rendered by
// EventInvitationService, so Fanout must not also send the generic one.
func TestHasDedicatedEmailTemplate(t *testing.T) {
	dedicated := []string{
		model.NotificationTypeTicketCreated,
		model.NotificationTypeTicketReplied,
		model.NotificationTypeTicketAssigned,
		model.NotificationTypeTicketStatusChanged,
		model.NotificationTypeFeatureRequestStateChanged,
		model.NotificationTypeEventInvitation,
	}
	for _, typ := range dedicated {
		if !hasDedicatedEmailTemplate(typ) {
			t.Errorf("%s: expected a dedicated email template", typ)
		}
	}
	generic := []string{
		model.NotificationTypeScoreValidationRequested,
		model.NotificationTypeLeagueJoinRequest,
		model.NotificationTypeClubRoleChanged,
		model.NotificationTypeEventResultsPosted,
	}
	for _, typ := range generic {
		if hasDedicatedEmailTemplate(typ) {
			t.Errorf("%s: expected the generic notification email", typ)
		}
	}
}
