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
		{NotificationTypeTicketCreated, func(p *NotificationPreferences, v bool) { p.TicketCreated = v }},
		{NotificationTypeTicketReplied, func(p *NotificationPreferences, v bool) { p.TicketReplied = v }},
		{NotificationTypeTicketAssigned, func(p *NotificationPreferences, v bool) { p.TicketAssigned = v }},
		{NotificationTypeTicketStatusChanged, func(p *NotificationPreferences, v bool) { p.TicketStatusChanged = v }},
		{NotificationTypeFeatureRequestStateChanged, func(p *NotificationPreferences, v bool) { p.FeatureRequestStateChanged = v }},
		{NotificationTypeScoreValidationRequested, func(p *NotificationPreferences, v bool) { p.ScoreValidationRequested = v }},
		{NotificationTypeLeagueJoinRequest, func(p *NotificationPreferences, v bool) { p.LeagueJoinRequest = v }},
		{NotificationTypeLeagueJoinRejected, func(p *NotificationPreferences, v bool) { p.LeagueJoinRejected = v }},
		{NotificationTypeLeagueRoleChanged, func(p *NotificationPreferences, v bool) { p.LeagueRoleChanged = v }},
		{NotificationTypeLeagueRoundOpened, func(p *NotificationPreferences, v bool) { p.LeagueRoundOpened = v }},
		{NotificationTypeClubJoinRequest, func(p *NotificationPreferences, v bool) { p.ClubJoinRequest = v }},
		{NotificationTypeClubJoinRejected, func(p *NotificationPreferences, v bool) { p.ClubJoinRejected = v }},
		{NotificationTypeClubRoleChanged, func(p *NotificationPreferences, v bool) { p.ClubRoleChanged = v }},
		{NotificationTypeEventInvitation, func(p *NotificationPreferences, v bool) { p.EventInvitation = v }},
		{NotificationTypeEventParticipantJoined, func(p *NotificationPreferences, v bool) { p.EventParticipantJoined = v }},
		{NotificationTypeEventWentLive, func(p *NotificationPreferences, v bool) { p.EventWentLive = v }},
		{NotificationTypeEventResultsPosted, func(p *NotificationPreferences, v bool) { p.EventResultsPosted = v }},
		{NotificationTypeAnnouncement, func(p *NotificationPreferences, v bool) { p.Announcement = v }},
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
		typ string
		// defaultOff marks the broadcast types whose email delivery is opt-in:
		// they reach every member, participant or follower, so shipping them to
		// an inbox by default would be spam.
		defaultOff bool
		setter     func(*NotificationPreferences, bool)
	}{
		{NotificationTypeFollowRequest, false, func(p *NotificationPreferences, v bool) { p.FollowRequestEmail = v }},
		{NotificationTypeFollowAccepted, false, func(p *NotificationPreferences, v bool) { p.FollowAcceptedEmail = v }},
		{NotificationTypeCommentOnCard, false, func(p *NotificationPreferences, v bool) { p.CommentOnMyCardEmail = v }},
		{NotificationTypeReplyToMyComment, false, func(p *NotificationPreferences, v bool) { p.ReplyToMyCommentEmail = v }},
		{NotificationTypeLikeOnMyContent, false, func(p *NotificationPreferences, v bool) { p.LikeOnMyContentEmail = v }},
		{NotificationTypeScoreVerified, false, func(p *NotificationPreferences, v bool) { p.ScoreVerifiedEmail = v }},
		{NotificationTypeScoreRejected, false, func(p *NotificationPreferences, v bool) { p.ScoreRejectedEmail = v }},
		{NotificationTypeScoreAmended, false, func(p *NotificationPreferences, v bool) { p.ScoreAmendedEmail = v }},
		{NotificationTypeLeagueJoinApproved, false, func(p *NotificationPreferences, v bool) { p.LeagueJoinApprovedEmail = v }},
		{NotificationTypeClubJoinApproved, false, func(p *NotificationPreferences, v bool) { p.ClubJoinApprovedEmail = v }},
		{NotificationTypeMention, false, func(p *NotificationPreferences, v bool) { p.MentionEmail = v }},
		{NotificationTypeTicketCreated, false, func(p *NotificationPreferences, v bool) { p.TicketCreatedEmail = v }},
		{NotificationTypeTicketReplied, false, func(p *NotificationPreferences, v bool) { p.TicketRepliedEmail = v }},
		{NotificationTypeTicketAssigned, false, func(p *NotificationPreferences, v bool) { p.TicketAssignedEmail = v }},
		{NotificationTypeTicketStatusChanged, false, func(p *NotificationPreferences, v bool) { p.TicketStatusChangedEmail = v }},
		{NotificationTypeFeatureRequestStateChanged, false, func(p *NotificationPreferences, v bool) { p.FeatureRequestStateChangedEmail = v }},
		{NotificationTypeScoreValidationRequested, true, func(p *NotificationPreferences, v bool) { p.ScoreValidationRequestedEmail = v }},
		{NotificationTypeLeagueJoinRequest, false, func(p *NotificationPreferences, v bool) { p.LeagueJoinRequestEmail = v }},
		{NotificationTypeLeagueJoinRejected, false, func(p *NotificationPreferences, v bool) { p.LeagueJoinRejectedEmail = v }},
		{NotificationTypeLeagueRoleChanged, false, func(p *NotificationPreferences, v bool) { p.LeagueRoleChangedEmail = v }},
		{NotificationTypeLeagueRoundOpened, true, func(p *NotificationPreferences, v bool) { p.LeagueRoundOpenedEmail = v }},
		{NotificationTypeClubJoinRequest, false, func(p *NotificationPreferences, v bool) { p.ClubJoinRequestEmail = v }},
		{NotificationTypeClubJoinRejected, false, func(p *NotificationPreferences, v bool) { p.ClubJoinRejectedEmail = v }},
		{NotificationTypeClubRoleChanged, false, func(p *NotificationPreferences, v bool) { p.ClubRoleChangedEmail = v }},
		{NotificationTypeEventInvitation, false, func(p *NotificationPreferences, v bool) { p.EventInvitationEmail = v }},
		{NotificationTypeEventParticipantJoined, true, func(p *NotificationPreferences, v bool) { p.EventParticipantJoinedEmail = v }},
		{NotificationTypeEventWentLive, true, func(p *NotificationPreferences, v bool) { p.EventWentLiveEmail = v }},
		{NotificationTypeEventResultsPosted, true, func(p *NotificationPreferences, v bool) { p.EventResultsPostedEmail = v }},
		{NotificationTypeAnnouncement, false, func(p *NotificationPreferences, v bool) { p.AnnouncementEmail = v }},
	}
	for _, tc := range cases {
		p := DefaultNotificationPreferences("u")
		if got := p.EmailEnabledForType(tc.typ); got == tc.defaultOff {
			t.Errorf("%s: default email pref should be %t, got %t", tc.typ, !tc.defaultOff, got)
		}
		tc.setter(p, false)
		if p.EmailEnabledForType(tc.typ) {
			t.Errorf("%s: expected false after setter(false), got true", tc.typ)
		}
		tc.setter(p, true)
		if !p.EmailEnabledForType(tc.typ) {
			t.Errorf("%s: expected true after setter(true), got false", tc.typ)
		}
	}
}

// Being sent strangers' cards to check is a favour somebody volunteers for.
// If any of these ever defaults on, every account starts receiving other
// people's validation requests the moment they sign up.
func TestReviewVolunteerPrefsAreOptIn(t *testing.T) {
	p := DefaultNotificationPreferences("u")
	if p.ReviewRequestsPublic || p.ReviewRequestsLeagues || p.ReviewRequestsClubLeagues {
		t.Errorf("review volunteer flags must default off, got %+v", []bool{
			p.ReviewRequestsPublic, p.ReviewRequestsLeagues, p.ReviewRequestsClubLeagues,
		})
	}
}
