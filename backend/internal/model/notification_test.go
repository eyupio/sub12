package model

import "testing"

func TestEnabledForType_UnknownReturnsTrue(t *testing.T) {
	p := DefaultNotificationPreferences("u")
	if !p.EnabledForType("not_a_real_type") {
		t.Errorf("EnabledForType: unknown type should return true (in-app default-on)")
	}
}

func TestEmailEnabledForType_UnknownReturnsFalse(t *testing.T) {
	p := DefaultNotificationPreferences("u")
	if p.EmailEnabledForType("not_a_real_type") {
		t.Errorf("EmailEnabledForType: unknown type should return false (email opt-in)")
	}
}

func TestEnabledForType_PerType(t *testing.T) {
	cases := []struct {
		typ    string
		setter func(*NotificationPreferences, bool)
	}{
		{NotificationTypeFollowRequest, func(p *NotificationPreferences, v bool) { p.FollowRequest = v }},
		{NotificationTypeFollowAccepted, func(p *NotificationPreferences, v bool) { p.FollowAccepted = v }},
		{NotificationTypeCommentOnCard, func(p *NotificationPreferences, v bool) { p.CommentOnMyCard = v }},
		{NotificationTypeReplyToMyComment, func(p *NotificationPreferences, v bool) { p.ReplyToMyComment = v }},
		{NotificationTypeLikeOnMyContent, func(p *NotificationPreferences, v bool) { p.LikeOnMyContent = v }},
		{NotificationTypeScoreVerified, func(p *NotificationPreferences, v bool) { p.ScoreVerified = v }},
		{NotificationTypeScoreRejected, func(p *NotificationPreferences, v bool) { p.ScoreRejected = v }},
		{NotificationTypeScoreAmended, func(p *NotificationPreferences, v bool) { p.ScoreAmended = v }},
		{NotificationTypeLeagueJoinApproved, func(p *NotificationPreferences, v bool) { p.LeagueJoinApproved = v }},
		{NotificationTypeClubJoinApproved, func(p *NotificationPreferences, v bool) { p.ClubJoinApproved = v }},
		{NotificationTypeMention, func(p *NotificationPreferences, v bool) { p.Mention = v }},
	}
	for _, tc := range cases {
		p := DefaultNotificationPreferences("u")
		tc.setter(p, false)
		if p.EnabledForType(tc.typ) {
			t.Errorf("%s: expected false after setter(false), got true", tc.typ)
		}
		tc.setter(p, true)
		if !p.EnabledForType(tc.typ) {
			t.Errorf("%s: expected true after setter(true), got false", tc.typ)
		}
	}
}

func TestEmailEnabledForType_PerType(t *testing.T) {
	cases := []struct {
		typ    string
		setter func(*NotificationPreferences, bool)
	}{
		{NotificationTypeFollowRequest, func(p *NotificationPreferences, v bool) { p.FollowRequestEmail = v }},
		{NotificationTypeFollowAccepted, func(p *NotificationPreferences, v bool) { p.FollowAcceptedEmail = v }},
		{NotificationTypeCommentOnCard, func(p *NotificationPreferences, v bool) { p.CommentOnMyCardEmail = v }},
		{NotificationTypeReplyToMyComment, func(p *NotificationPreferences, v bool) { p.ReplyToMyCommentEmail = v }},
		{NotificationTypeLikeOnMyContent, func(p *NotificationPreferences, v bool) { p.LikeOnMyContentEmail = v }},
		{NotificationTypeScoreVerified, func(p *NotificationPreferences, v bool) { p.ScoreVerifiedEmail = v }},
		{NotificationTypeScoreRejected, func(p *NotificationPreferences, v bool) { p.ScoreRejectedEmail = v }},
		{NotificationTypeScoreAmended, func(p *NotificationPreferences, v bool) { p.ScoreAmendedEmail = v }},
		{NotificationTypeLeagueJoinApproved, func(p *NotificationPreferences, v bool) { p.LeagueJoinApprovedEmail = v }},
		{NotificationTypeClubJoinApproved, func(p *NotificationPreferences, v bool) { p.ClubJoinApprovedEmail = v }},
		{NotificationTypeMention, func(p *NotificationPreferences, v bool) { p.MentionEmail = v }},
	}
	for _, tc := range cases {
		p := DefaultNotificationPreferences("u")
		if p.EmailEnabledForType(tc.typ) {
			t.Errorf("%s: default email pref should be false, got true", tc.typ)
		}
		tc.setter(p, true)
		if !p.EmailEnabledForType(tc.typ) {
			t.Errorf("%s: expected true after setter(true), got false", tc.typ)
		}
	}
}
