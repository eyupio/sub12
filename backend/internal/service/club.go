package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var (
	ErrClubNotFound       = errors.New("club not found")
	ErrClubAlreadyMember  = errors.New("already a member of this club")
	ErrClubNotAdmin       = errors.New("club moderator access required")
	ErrClubNotMember      = errors.New("not a member of this club")
	ErrClubLastAdmin      = errors.New("cannot leave as the last moderator; promote another member first")
	ErrInvalidClub        = errors.New("club name is required")
	ErrClubInvalidType    = errors.New("type must be 'public' or 'private'")
	ErrClubInvalidPolicy  = errors.New("join_policy must be 'open', 'invite_code', or 'approval'")
	ErrClubPendingRequest = errors.New("join request already pending")
	ErrClubInvalidCode    = errors.New("invalid join code")
	ErrClubInvalidDecide  = errors.New("decision must be 'approved' or 'rejected'")
	ErrClubValidation     = errors.New("invalid club details")
	// ErrClubNotPermitted is returned when the caller is a moderator but the
	// owner did not delegate the capability the action needs. It wraps
	// ErrClubNotAdmin so every caller that already refuses non-moderators
	// refuses this too.
	ErrClubNotPermitted = fmt.Errorf("%w: the owner has not delegated this capability to you", ErrClubNotAdmin)
	// ErrClubOwnerOnly guards the capabilities that stay with the club's owner
	// and are never delegated.
	ErrClubOwnerOnly = fmt.Errorf("%w: only the club owner can do this", ErrClubNotAdmin)
	// ErrCannotRemoveModerator keeps a member-management grant from being used
	// against the moderators, and the owner, who granted it.
	ErrCannotRemoveModerator = fmt.Errorf("%w: demote this moderator before removing them", ErrClubNotAdmin)
)

// clubInvalid builds a validation error that handlers surface verbatim as a
// 422, so the club editor can point at the offending field.
func clubInvalid(format string, a ...any) error {
	return fmt.Errorf("%w: %s", ErrClubValidation, fmt.Sprintf(format, a...))
}

type ClubService struct {
	repo          *repository.ClubRepository
	activity      *ActivityService     // nil disables feed ingestion
	achievements  *AchievementService  // nil disables achievement evaluation
	notifications *NotificationService // nil disables notification fan-out
}

func NewClubService(repo *repository.ClubRepository, activity *ActivityService, achievements *AchievementService) *ClubService {
	return &ClubService{repo: repo, activity: activity, achievements: achievements}
}

// SetNotifications wires notification fan-out. Optional — without it club
// actions still succeed, they just notify nobody.
func (s *ClubService) SetNotifications(n *NotificationService) {
	s.notifications = n
}

// clubName resolves a club's display name for notification copy. Empty on any
// lookup failure — the copy falls back to "your club" rather than dropping the
// notification.
func (s *ClubService) clubName(ctx context.Context, clubID string) string {
	club, err := s.repo.GetByID(ctx, clubID, "")
	if err != nil || club == nil {
		return ""
	}
	return club.Name
}

// notifyClubModerators fans an event out to everyone who runs the club — the
// moderators and the owner, who holds every capability implicitly and so is not
// necessarily carried in club_members.is_admin.
func (s *ClubService) notifyClubModerators(ctx context.Context, clubID, actorID, notifType string, metadata map[string]any) {
	if s.notifications == nil {
		return
	}
	recipients := map[string]struct{}{}
	if ids, err := s.repo.ListAdminIDs(ctx, clubID); err == nil {
		for _, id := range ids {
			recipients[id] = struct{}{}
		}
	}
	if club, err := s.repo.GetByID(ctx, clubID, ""); err == nil && club != nil {
		recipients[club.CreatedBy] = struct{}{}
	}
	delete(recipients, actorID)
	cid, tt := clubID, "club"
	for rid := range recipients {
		s.notifications.Fanout(ctx, NotifEvent{
			RecipientID: rid,
			ActorID:     actorID,
			Type:        notifType,
			TargetID:    &cid,
			TargetType:  &tt,
			ClubID:      &cid,
			Metadata:    metadata,
		})
	}
}

// notifyClubMember tells one member about something addressed to them.
func (s *ClubService) notifyClubMember(ctx context.Context, clubID, actorID, recipientID, notifType string, metadata map[string]any) {
	if s.notifications == nil {
		return
	}
	cid, tt := clubID, "club"
	s.notifications.Fanout(ctx, NotifEvent{
		RecipientID: recipientID,
		ActorID:     actorID,
		Type:        notifType,
		TargetID:    &cid,
		TargetType:  &tt,
		ClubID:      &cid,
		Metadata:    metadata,
	})
}

func (s *ClubService) Create(ctx context.Context, userID string, input *model.CreateClubInput) (*model.Club, error) {
	if input.Name == "" {
		return nil, ErrInvalidClub
	}
	if input.Type != nil && *input.Type != "public" && *input.Type != "private" {
		return nil, ErrClubInvalidType
	}
	if input.JoinPolicy != nil && *input.JoinPolicy != "open" && *input.JoinPolicy != "invite_code" && *input.JoinPolicy != "approval" {
		return nil, ErrClubInvalidPolicy
	}
	return s.repo.Create(ctx, userID, input)
}

// GetByID returns a club when the viewer is allowed to see it. Private clubs
// are visible only to members; non-members receive ErrClubNotFound. Site
// admins (viewerRole == "admin") bypass the privacy gate so they can moderate
// any club.
func (s *ClubService) GetByID(ctx context.Context, clubID, viewerID, viewerRole string) (*model.Club, error) {
	club, err := s.repo.GetByID(ctx, clubID, viewerID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrClubNotFound
		}
		return nil, err
	}
	isAdmin := viewerRole == "admin"
	if club.Type == "private" && !club.IsMember && !isAdmin {
		return nil, ErrClubNotFound
	}
	if !club.IsMember {
		club.JoinCode = ""
	}
	return club, nil
}

// List returns the club directory for a viewer, narrowed by the supplied
// filters. An unknown discipline yields an empty directory rather than an
// error — the filter is a discovery aid, not a mutation.
func (s *ClubService) List(ctx context.Context, viewerID string, q model.ClubDirectoryQuery) ([]*model.Club, error) {
	// Proximity only makes sense with both coordinates; a lone one is ignored.
	if q.Latitude == nil || q.Longitude == nil {
		q.Latitude, q.Longitude, q.RadiusKM = nil, nil, nil
	}
	clubs, err := s.repo.List(ctx, viewerID, q)
	if err != nil {
		return nil, err
	}
	for _, c := range clubs {
		if !c.IsMember {
			c.JoinCode = ""
		}
	}
	return clubs, nil
}

// LookupByJoinCode resolves a club from a join code (case-insensitive,
// whitespace-trimmed), bypassing public/private gating so codes work as
// invite/discovery handles. Returns (nil, nil) for blank codes or no match.
// JoinCode is stripped from the response for non-members to mirror List/GetByID.
func (s *ClubService) LookupByJoinCode(ctx context.Context, code, viewerID string) (*model.Club, error) {
	code = strings.TrimSpace(code)
	if code == "" {
		return nil, nil
	}
	club, err := s.repo.GetByJoinCode(ctx, code, viewerID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if !club.IsMember {
		club.JoinCode = ""
	}
	return club, nil
}

// SummaryByID returns a minimal public summary of any club, including private
// ones. Used to render a members-only banner with a join CTA without
// exposing members, standings or posts.
func (s *ClubService) SummaryByID(ctx context.Context, clubID string) (*model.ClubSummary, error) {
	club, err := s.repo.GetByID(ctx, clubID, "")
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrClubNotFound
		}
		return nil, err
	}
	return &model.ClubSummary{
		ID:             club.ID,
		Name:           club.Name,
		Description:    club.Description,
		ImageURL:       club.ImageURL,
		Type:           club.Type,
		JoinPolicy:     club.JoinPolicy,
		PostVisibility: club.PostVisibility,
		MemberCount:    club.MemberCount,
		City:           club.City,
		Region:         club.Region,
		Country:        club.Country,
		Disciplines:    club.Disciplines,
	}, nil
}

func (s *ClubService) ListByUser(ctx context.Context, userID string) ([]*model.Club, error) {
	return s.repo.ListByUser(ctx, userID)
}

// Join routes through the club's join policy.
// Returns (joined, pending, err).
func (s *ClubService) Join(ctx context.Context, clubID, userID, joinCode string) (bool, bool, error) {
	club, err := s.repo.GetByID(ctx, clubID, "")
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return false, false, ErrClubNotFound
		}
		return false, false, err
	}

	member, err := s.repo.IsMember(ctx, clubID, userID)
	if err != nil {
		return false, false, err
	}
	if member {
		return false, false, ErrClubAlreadyMember
	}

	switch club.JoinPolicy {
	case "open":
		// fall through to instant join below
	case "invite_code":
		if joinCode == "" || joinCode != club.JoinCode {
			return false, false, ErrClubInvalidCode
		}
	case "approval":
		_, err := s.repo.CreateJoinRequest(ctx, clubID, userID)
		if errors.Is(err, repository.ErrConflict) {
			return false, false, ErrClubPendingRequest
		}
		if err != nil {
			return false, false, err
		}
		s.notifyClubModerators(ctx, clubID, userID, model.NotificationTypeClubJoinRequest, map[string]any{
			"club_name": club.Name,
		})
		return false, true, nil
	default:
		return false, false, fmt.Errorf("unknown club join policy")
	}

	if err := s.repo.Join(ctx, clubID, userID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return false, false, ErrClubNotFound
		}
		if errors.Is(err, repository.ErrAlreadyMember) {
			return false, false, ErrClubAlreadyMember
		}
		return false, false, err
	}
	if s.activity != nil {
		cid, tt := clubID, "club"
		meta := model.JoinedClubMeta{ClubName: club.Name}
		go s.activity.Ingest(context.Background(), userID, model.ActivityJoinedClub, &cid, &tt, meta, nil, &cid, "public")
	}
	if s.achievements != nil {
		go s.achievements.EvaluateForClubJoin(context.Background(), userID)
	}
	return true, false, nil
}

func (s *ClubService) IsMember(ctx context.Context, clubID, userID string) (bool, error) {
	return s.repo.IsMember(ctx, clubID, userID)
}

// GetMemberRole reports the caller's standing in a club — owner, moderator or
// plain member — together with the capabilities the owner delegated.
func (s *ClubService) GetMemberRole(ctx context.Context, clubID, userID string) (*model.MemberRole, error) {
	return s.repo.GetMemberRole(ctx, clubID, userID)
}

// IsModerator reports whether the user runs the club, without regard to which
// capabilities they hold.
func (s *ClubService) IsModerator(ctx context.Context, clubID, userID string) (bool, error) {
	return s.repo.IsModerator(ctx, clubID, userID)
}

// Can reports whether the user may exercise one delegated capability. Owners
// always can.
func (s *ClubService) Can(ctx context.Context, clubID, userID, permission string) (bool, error) {
	role, err := s.repo.GetMemberRole(ctx, clubID, userID)
	if err != nil {
		return false, err
	}
	return role.Can(permission), nil
}

// require gates an action on a delegated capability. A non-moderator is told
// they are not a moderator; a moderator missing the grant is told the owner
// did not delegate it, so the two cases stay distinguishable in the UI.
func (s *ClubService) require(ctx context.Context, clubID, userID, permission string) error {
	role, err := s.repo.GetMemberRole(ctx, clubID, userID)
	if err != nil {
		return err
	}
	if !role.IsModerator {
		return ErrClubNotAdmin
	}
	if !role.Can(permission) {
		return ErrClubNotPermitted
	}
	return nil
}

// ListMembers returns club members. Private clubs are gated to members only;
// site admins bypass the gate. The delegation map is redacted for anyone who
// does not help run the club — who the moderators are is public, which
// capabilities each was granted is the owner's business.
func (s *ClubService) ListMembers(ctx context.Context, clubID, viewerID, viewerRole string) ([]*model.ClubMember, error) {
	if err := s.ensureClubAccess(ctx, clubID, viewerID, viewerRole); err != nil {
		return nil, err
	}
	members, err := s.repo.ListMembers(ctx, clubID)
	if err != nil {
		return nil, err
	}
	isModerator, err := s.repo.IsModerator(ctx, clubID, viewerID)
	if err != nil {
		return nil, err
	}
	if !isModerator && viewerRole != "admin" {
		for _, m := range members {
			m.Permissions = nil
		}
	}
	return members, nil
}

// GetStandings returns club standings. Private clubs are gated to members
// only; site admins bypass the gate.
func (s *ClubService) GetStandings(ctx context.Context, clubID, viewerID, viewerRole string) ([]*model.ClubStanding, error) {
	if err := s.ensureClubAccess(ctx, clubID, viewerID, viewerRole); err != nil {
		return nil, err
	}
	return s.repo.GetStandings(ctx, clubID)
}

// ensureClubAccess enforces that viewers can see content from private clubs
// only when they are members. Site admins always have access.
func (s *ClubService) ensureClubAccess(ctx context.Context, clubID, viewerID, viewerRole string) error {
	club, err := s.repo.GetByID(ctx, clubID, "")
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrClubNotFound
		}
		return err
	}
	if club.Type != "private" {
		return nil
	}
	if viewerRole == "admin" {
		return nil
	}
	if viewerID == "" {
		return ErrClubNotFound
	}
	isMember, err := s.repo.IsMember(ctx, clubID, viewerID)
	if err != nil {
		return err
	}
	if !isMember {
		return ErrClubNotFound
	}
	return nil
}

// ListJoinRequests returns pending (or filtered) join requests for admins.
func (s *ClubService) ListJoinRequests(ctx context.Context, clubID, requesterID, status string) ([]*model.ClubJoinRequest, error) {
	if err := s.require(ctx, clubID, requesterID, model.PermManageMembers); err != nil {
		return nil, err
	}
	return s.repo.ListJoinRequests(ctx, clubID, status)
}

// DecideJoinRequest accepts or rejects a join request; on approval the
// requester is added as a member.
func (s *ClubService) DecideJoinRequest(ctx context.Context, clubID, requestID, adminID, decision string) error {
	if decision != "approved" && decision != "rejected" {
		return ErrClubInvalidDecide
	}
	if err := s.require(ctx, clubID, adminID, model.PermManageMembers); err != nil {
		return err
	}
	req, err := s.repo.DecideJoinRequest(ctx, requestID, adminID, decision)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrClubNotFound
		}
		return err
	}
	if req.ClubID != clubID {
		// Request belongs to a different club; treat as not-found.
		return ErrClubNotFound
	}
	if decision == "approved" {
		if err := s.repo.Join(ctx, clubID, req.UserID); err != nil {
			return err
		}
		club, clubErr := s.repo.GetByID(ctx, clubID, "")
		if s.activity != nil {
			// Skip the activity feed entry entirely if we can't resolve the
			// club name — better to drop one best-effort entry than to write
			// a blank-name "joined club" record that nobody can debug later.
			if clubErr == nil && club != nil {
				cid, tt := clubID, "club"
				meta := model.JoinedClubMeta{ClubName: club.Name}
				go s.activity.Ingest(context.Background(), req.UserID, model.ActivityJoinedClub, &cid, &tt, meta, nil, &cid, "public")
			}
		}
		if s.notifications != nil {
			cid, tt := clubID, "club"
			meta := map[string]any{}
			if clubErr == nil && club != nil {
				meta["club_name"] = club.Name
			}
			s.notifications.Fanout(ctx, NotifEvent{
				RecipientID: req.UserID,
				ActorID:     adminID,
				Type:        model.NotificationTypeClubJoinApproved,
				TargetID:    &cid,
				TargetType:  &tt,
				ClubID:      &cid,
				Metadata:    meta,
			})
		}
		if s.achievements != nil {
			go s.achievements.EvaluateForClubJoin(context.Background(), req.UserID)
		}
	} else {
		s.notifyClubMember(ctx, clubID, adminID, req.UserID, model.NotificationTypeClubJoinRejected, map[string]any{
			"club_name": s.clubName(ctx, clubID),
		})
	}
	return nil
}

// RemoveMember removes a plain member. Moderators — the owner above all — have
// to be demoted first, so a delegated manage_members grant can never be turned
// on the people who granted it. This mirrors the league repository, which
// refuses the delete outright.
func (s *ClubService) RemoveMember(ctx context.Context, clubID, requesterID, targetID string) error {
	if err := s.require(ctx, clubID, requesterID, model.PermManageMembers); err != nil {
		return err
	}
	targetRole, err := s.repo.GetMemberRole(ctx, clubID, targetID)
	if err != nil {
		return err
	}
	if targetRole.IsModerator {
		return ErrCannotRemoveModerator
	}
	return s.repo.RemoveMember(ctx, clubID, targetID)
}

func (s *ClubService) UpdateImageURL(ctx context.Context, clubID, requesterID, url string) error {
	if err := s.require(ctx, clubID, requesterID, model.PermManageSettings); err != nil {
		return err
	}
	return s.repo.UpdateImageURL(ctx, clubID, url)
}

// UpdateClub allows a club admin to update the club's settings and profile.
func (s *ClubService) UpdateClub(ctx context.Context, clubID, requesterID string, in *model.UpdateClubInput) (*model.Club, error) {
	if err := s.require(ctx, clubID, requesterID, model.PermManageSettings); err != nil {
		return nil, err
	}
	if err := ValidateClubUpdate(in); err != nil {
		return nil, err
	}
	club, err := s.repo.AdminUpdate(ctx, clubID, in)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrClubNotFound, err)
	}
	return club, nil
}

// ValidateClubUpdate normalises and checks a club update in place. It is shared
// by the club-admin and platform-admin paths so both enforce the same rules.
func ValidateClubUpdate(in *model.UpdateClubInput) error {
	if in.Name != nil {
		*in.Name = strings.TrimSpace(*in.Name)
		if *in.Name == "" {
			return ErrInvalidClub
		}
	}
	if in.Type != nil && *in.Type != "public" && *in.Type != "private" {
		return ErrClubInvalidType
	}
	if in.JoinPolicy != nil && *in.JoinPolicy != "open" && *in.JoinPolicy != "invite_code" && *in.JoinPolicy != "approval" {
		return ErrClubInvalidPolicy
	}
	if in.PostVisibility != nil && *in.PostVisibility != "members" && *in.PostVisibility != "public" {
		return ErrInvalidClub
	}
	if in.DateFormat != nil && !IsValidDateFormat(*in.DateFormat) {
		return ErrInvalidClub
	}
	if in.TimeFormat != nil && !IsValidTimeFormat(*in.TimeFormat) {
		return ErrInvalidClub
	}
	if in.Timezone != nil && !IsValidTimezone(*in.Timezone) {
		return ErrInvalidClub
	}

	// Free-text profile fields: trim, then bound so one club can't push a
	// novel into the directory.
	text := []struct {
		field *string
		name  string
		max   int
	}{
		{in.Description, "description", 2000},
		{in.WebsiteURL, "website_url", 500},
		{in.ContactEmail, "contact_email", 254},
		{in.ContactPhone, "contact_phone", 40},
		{in.AddressLine1, "address_line1", 200},
		{in.AddressLine2, "address_line2", 200},
		{in.City, "city", 120},
		{in.Region, "region", 120},
		{in.Postcode, "postcode", 20},
		{in.Country, "country", 120},
		{in.MembershipInfo, "membership_info", 4000},
		{in.VisitorPolicy, "visitor_policy", 4000},
	}
	for _, t := range text {
		if t.field == nil {
			continue
		}
		*t.field = strings.TrimSpace(*t.field)
		if len([]rune(*t.field)) > t.max {
			return clubInvalid("%s must be %d characters or fewer", t.name, t.max)
		}
	}

	if in.WebsiteURL != nil && *in.WebsiteURL != "" {
		if !strings.HasPrefix(*in.WebsiteURL, "http://") && !strings.HasPrefix(*in.WebsiteURL, "https://") {
			return clubInvalid("website_url must start with http:// or https://")
		}
	}
	if in.ContactEmail != nil && *in.ContactEmail != "" && !looksLikeEmail(*in.ContactEmail) {
		return clubInvalid("contact_email must be a valid email address")
	}

	// Coordinates are only meaningful as a pair.
	if !in.ClearCoordinates && (in.Latitude != nil) != (in.Longitude != nil) {
		return clubInvalid("latitude and longitude must be set together")
	}
	if in.Latitude != nil && (*in.Latitude < -90 || *in.Latitude > 90) {
		return clubInvalid("latitude must be between -90 and 90")
	}
	if in.Longitude != nil && (*in.Longitude < -180 || *in.Longitude > 180) {
		return clubInvalid("longitude must be between -180 and 180")
	}

	if in.EstablishedYear != nil && *in.EstablishedYear != 0 {
		// 0 is the agreed "clear this" value; anything else must be plausible.
		if *in.EstablishedYear < 1800 || *in.EstablishedYear > time.Now().Year() {
			return clubInvalid("established_year must be between 1800 and %d", time.Now().Year())
		}
	}

	if in.Disciplines != nil {
		normalised, err := normaliseDisciplines(*in.Disciplines)
		if err != nil {
			return err
		}
		*in.Disciplines = normalised
	}
	for _, l := range []struct {
		list *[]string
		name string
	}{{in.Distances, "distances"}, {in.Facilities, "facilities"}} {
		if l.list == nil {
			continue
		}
		normalised, err := normaliseFreeList(*l.list, l.name)
		if err != nil {
			return err
		}
		*l.list = normalised
	}

	return nil
}

// looksLikeEmail is a shape check, not an RFC validator — the club editor just
// needs to catch obvious typos in a published contact address.
func looksLikeEmail(s string) bool {
	at := strings.Index(s, "@")
	if at <= 0 || at == len(s)-1 || strings.Count(s, "@") != 1 {
		return false
	}
	domain := s[at+1:]
	return strings.Contains(domain, ".") && !strings.HasPrefix(domain, ".") && !strings.HasSuffix(domain, ".") &&
		!strings.ContainsAny(s, " \t")
}

// normaliseDisciplines lower-cases, de-duplicates and validates the supplied
// disciplines against model.ClubDisciplines so directory filters match.
func normaliseDisciplines(in []string) ([]string, error) {
	if len(in) > model.ClubProfileListLimit {
		return nil, clubInvalid("disciplines is limited to %d entries", model.ClubProfileListLimit)
	}
	allowed := make(map[string]struct{}, len(model.ClubDisciplines))
	for _, d := range model.ClubDisciplines {
		allowed[d] = struct{}{}
	}
	seen := make(map[string]struct{}, len(in))
	out := make([]string, 0, len(in))
	for _, raw := range in {
		d := strings.ToLower(strings.TrimSpace(raw))
		if d == "" {
			continue
		}
		if _, ok := allowed[d]; !ok {
			return nil, clubInvalid("%q is not a recognised discipline", raw)
		}
		if _, dup := seen[d]; dup {
			continue
		}
		seen[d] = struct{}{}
		out = append(out, d)
	}
	return out, nil
}

// normaliseFreeList trims, de-duplicates and bounds a free-text profile list
// such as distances or facilities.
func normaliseFreeList(in []string, name string) ([]string, error) {
	if len(in) > model.ClubProfileListLimit {
		return nil, clubInvalid("%s is limited to %d entries", name, model.ClubProfileListLimit)
	}
	seen := make(map[string]struct{}, len(in))
	out := make([]string, 0, len(in))
	for _, raw := range in {
		v := strings.TrimSpace(raw)
		if v == "" {
			continue
		}
		if len([]rune(v)) > 60 {
			return nil, clubInvalid("each %s entry must be 60 characters or fewer", name)
		}
		key := strings.ToLower(v)
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, v)
	}
	return out, nil
}

// GetOpeningHours returns a club's published week. Private clubs are gated to
// members; site admins bypass the gate.
func (s *ClubService) GetOpeningHours(ctx context.Context, clubID, viewerID, viewerRole string) ([]*model.ClubOpeningHours, error) {
	if err := s.ensureClubAccess(ctx, clubID, viewerID, viewerRole); err != nil {
		return nil, err
	}
	return s.repo.ListOpeningHours(ctx, clubID)
}

// ReplaceOpeningHours swaps a club's whole published week. Club admins only.
func (s *ClubService) ReplaceOpeningHours(ctx context.Context, clubID, requesterID string, slots []model.ClubOpeningHoursInput) ([]*model.ClubOpeningHours, error) {
	if err := s.require(ctx, clubID, requesterID, model.PermManageSettings); err != nil {
		return nil, err
	}
	if err := ValidateOpeningHours(slots); err != nil {
		return nil, err
	}
	if err := s.repo.ReplaceOpeningHours(ctx, clubID, slots); err != nil {
		return nil, err
	}
	return s.repo.ListOpeningHours(ctx, clubID)
}

// ClubOpeningHoursLimit caps how many slots a club may publish across the week
// (three per day is enough for morning/afternoon/evening sessions).
const ClubOpeningHoursLimit = 21

// ValidateOpeningHours normalises and checks a full-week opening hours payload
// in place.
func ValidateOpeningHours(slots []model.ClubOpeningHoursInput) error {
	if len(slots) > ClubOpeningHoursLimit {
		return clubInvalid("opening hours are limited to %d slots per week", ClubOpeningHoursLimit)
	}
	for i := range slots {
		s := &slots[i]
		if s.DayOfWeek < 0 || s.DayOfWeek > 6 {
			return clubInvalid("day_of_week must be between 0 (Monday) and 6 (Sunday)")
		}
		if s.Note != nil {
			*s.Note = strings.TrimSpace(*s.Note)
			if len([]rune(*s.Note)) > 120 {
				return clubInvalid("opening hours note must be 120 characters or fewer")
			}
		}
		if s.IsClosed {
			// A closed day carries no times, whatever the client sent.
			s.OpensAt, s.ClosesAt = nil, nil
			continue
		}
		if s.OpensAt == nil || s.ClosesAt == nil {
			return clubInvalid("opens_at and closes_at are required unless the day is marked closed")
		}
		opens, err := time.Parse("15:04", strings.TrimSpace(*s.OpensAt))
		if err != nil {
			return clubInvalid("opens_at must be a 24-hour HH:MM time")
		}
		closes, err := time.Parse("15:04", strings.TrimSpace(*s.ClosesAt))
		if err != nil {
			return clubInvalid("closes_at must be a 24-hour HH:MM time")
		}
		if !closes.After(opens) {
			return clubInvalid("closes_at must be later than opens_at")
		}
		*s.OpensAt = opens.Format("15:04")
		*s.ClosesAt = closes.Format("15:04")
	}
	return nil
}

// DeleteClub lets a club admin delete their own club. Everything hanging off
// the club (members, join requests, opening hours, posts) cascades; leagues
// are detached rather than deleted, per the club_id FK.
func (s *ClubService) DeleteClub(ctx context.Context, clubID, requesterID string) error {
	role, err := s.repo.GetMemberRole(ctx, clubID, requesterID)
	if err != nil {
		return err
	}
	if !role.IsOwner {
		return ErrClubOwnerOnly
	}
	if err := s.repo.AdminDelete(ctx, clubID); err != nil {
		return fmt.Errorf("%w: %v", ErrClubNotFound, err)
	}
	return nil
}

// RegenerateJoinCode rotates the club's invite code. Admins only.
func (s *ClubService) RegenerateJoinCode(ctx context.Context, clubID, requesterID string) (string, error) {
	if err := s.require(ctx, clubID, requesterID, model.PermManageSettings); err != nil {
		return "", err
	}
	code, err := s.repo.RegenerateJoinCode(ctx, clubID)
	if errors.Is(err, repository.ErrNotFound) {
		return "", ErrClubNotFound
	}
	return code, err
}

// LeaveClub allows a member to remove themselves from a club.
func (s *ClubService) LeaveClub(ctx context.Context, clubID, userID string) error {
	err := s.repo.LeaveClubGuarded(ctx, clubID, userID)
	if errors.Is(err, repository.ErrClubMemberNotFound) {
		return ErrClubNotMember
	}
	if errors.Is(err, repository.ErrClubLastAdmin) {
		return ErrClubLastAdmin
	}
	return err
}

// UpdateMemberRole promotes a member to moderator, demotes one, and/or
// re-grants what a moderator may do. Requires the moderator-management
// capability, which the owner holds implicitly.
//
// The owner's own role is not editable — they are the club's root of authority
// — and the last remaining moderator cannot be demoted.
func (s *ClubService) UpdateMemberRole(ctx context.Context, clubID, requesterID, targetID string, in *model.UpdateClubMemberInput) error {
	if err := s.require(ctx, clubID, requesterID, model.PermManageModerators); err != nil {
		return err
	}
	targetRole, err := s.repo.GetMemberRole(ctx, clubID, targetID)
	if err != nil {
		return err
	}
	if targetRole.IsOwner {
		return ErrCannotEditOwner
	}

	moderator := in.Moderator()
	if moderator != nil && !*moderator {
		// Demotion: enforce the last-moderator invariant atomically.
		err := s.repo.DemoteMemberGuarded(ctx, clubID, targetID)
		if errors.Is(err, repository.ErrClubLastAdmin) {
			return ErrClubLastAdmin
		}
		if errors.Is(err, repository.ErrClubMemberNotFound) {
			return ErrClubNotMember
		}
		if err != nil {
			return err
		}
		s.notifyClubMember(ctx, clubID, requesterID, targetID, model.NotificationTypeClubRoleChanged, map[string]any{
			"club_name":    s.clubName(ctx, clubID),
			"is_moderator": false,
		})
		return nil
	}

	// Promotion, or a re-grant on somebody already promoted.
	permissions := targetRole.Permissions
	if !targetRole.IsModerator {
		permissions = model.DefaultModeratorPermissions(model.ClubModeratorPermissions)
	}
	if in.Permissions != nil {
		permissions, err = s.delegatable(ctx, clubID, requesterID, *in.Permissions)
		if err != nil {
			return err
		}
	}
	if moderator == nil && !targetRole.IsModerator {
		// A grant with nothing to grant it to.
		return ErrNotModerator
	}
	if err := s.repo.PromoteMember(ctx, clubID, targetID, permissions); err != nil {
		if errors.Is(err, repository.ErrClubMemberNotFound) {
			return ErrClubNotMember
		}
		return err
	}
	// A bare re-grant on somebody already running the club is not a role
	// change; only the promotion itself is worth telling them about.
	if !targetRole.IsModerator {
		s.notifyClubMember(ctx, clubID, requesterID, targetID, model.NotificationTypeClubRoleChanged, map[string]any{
			"club_name":    s.clubName(ctx, clubID),
			"is_moderator": true,
		})
	}
	return nil
}

// delegatable narrows a requested grant to the recognised capabilities the
// granter holds themselves, so a moderator with manage_moderators can share
// their own reach but never manufacture more of it. Owners hold everything, so
// for them this only filters unknown keys.
func (s *ClubService) delegatable(ctx context.Context, clubID, granterID string, requested []string) ([]string, error) {
	granter, err := s.repo.GetMemberRole(ctx, clubID, granterID)
	if err != nil {
		return nil, err
	}
	wanted := model.NormaliseModeratorPermissions(model.ClubModeratorPermissions, requested)
	out := make([]string, 0, len(wanted))
	for _, p := range wanted {
		if granter.Can(p) {
			out = append(out, p)
		}
	}
	return out, nil
}

// AdminList returns every club, private ones included, for the platform admin
// console. Join codes are left intact — the admin console needs them to
// support club owners.
func (s *ClubService) AdminList(ctx context.Context) ([]*model.Club, error) {
	return s.repo.List(ctx, "", model.ClubDirectoryQuery{IncludePrivate: true})
}

// AdminUpdateClub applies a partial update to any club without ownership checks.
func (s *ClubService) AdminUpdateClub(ctx context.Context, id string, in *model.UpdateClubInput) (*model.Club, error) {
	if err := ValidateClubUpdate(in); err != nil {
		return nil, err
	}
	club, err := s.repo.AdminUpdate(ctx, id, in)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrClubNotFound, err)
	}
	return club, nil
}

// AdminDeleteClub removes a club without ownership checks.
func (s *ClubService) AdminDeleteClub(ctx context.Context, id string) error {
	return s.repo.AdminDelete(ctx, id)
}

// AdminRemoveMember removes a club member without checking club admin status.
func (s *ClubService) AdminRemoveMember(ctx context.Context, clubID, userID string) error {
	return s.repo.RemoveMember(ctx, clubID, userID)
}

// AdminAddMember adds a user to a club directly, bypassing the join policy.
// Used to enrol simulated accounts so they can interact with club content.
// Already-a-member is treated as success (idempotent).
func (s *ClubService) AdminAddMember(ctx context.Context, clubID, userID string) error {
	if err := s.repo.Join(ctx, clubID, userID); err != nil {
		if errors.Is(err, repository.ErrAlreadyMember) {
			return nil
		}
		if errors.Is(err, repository.ErrNotFound) {
			return ErrClubNotFound
		}
		return err
	}
	return nil
}

// AdminListMembers lists members for a club without the private-club viewer gate.
func (s *ClubService) AdminListMembers(ctx context.Context, clubID string) ([]*model.ClubMember, error) {
	return s.repo.ListMembers(ctx, clubID)
}
