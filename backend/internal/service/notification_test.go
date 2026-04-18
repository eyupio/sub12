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
