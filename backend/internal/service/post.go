package service

import (
	"context"
	"errors"
	"strings"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var (
	ErrPostBodyEmpty         = errors.New("post body cannot be empty")
	ErrPostBodyTooLong       = errors.New("post body exceeds maximum length of 5000 characters")
	ErrPostDenied            = errors.New("you do not have permission to post here")
	ErrPostInvalidVisibility = errors.New("invalid post visibility")
	ErrPostForbidden         = errors.New("not authorized to moderate this post")
	ErrPostFlagReasonEmpty   = errors.New("flag reason is required")
)

type PostService struct {
	posts         *repository.PostRepository
	leagues       *repository.LeagueRepository
	clubs         *repository.ClubRepository
	social        *repository.SocialRepository
	activity      *ActivityService
	notifications *NotificationService // optional; wired post-construction to avoid cycles
}

func NewPostService(posts *repository.PostRepository, leagues *repository.LeagueRepository, clubs *repository.ClubRepository, social *repository.SocialRepository, activity *ActivityService) *PostService {
	return &PostService{posts: posts, leagues: leagues, clubs: clubs, social: social, activity: activity}
}

// SetNotifications wires a notification service post-construction to avoid
// import cycles.
func (s *PostService) SetNotifications(n *NotificationService) {
	s.notifications = n
}

// Create validates and persists a new post.
func (s *PostService) Create(ctx context.Context, userID string, input *model.CreatePostInput) (*model.Post, error) {
	body := strings.TrimSpace(input.Body)
	if body == "" && len(input.Attachments) == 0 {
		return nil, ErrPostBodyEmpty
	}
	if len([]rune(body)) > 5000 {
		return nil, ErrPostBodyTooLong
	}
	input.Body = body

	// Resolve visibility: for scoped posts (league/club) the group admin's
	// post_visibility override wins — the poster does not choose. For
	// unscoped posts the author's selection is trusted, defaulting to public.
	var leagueName, clubName string
	if input.LeagueID != nil {
		member, err := s.leagues.IsMember(ctx, *input.LeagueID, userID)
		if err != nil {
			return nil, err
		}
		if !member {
			return nil, ErrPostDenied
		}
		league, err := s.leagues.GetByID(ctx, *input.LeagueID)
		if err != nil {
			return nil, err
		}
		input.Visibility = league.PostVisibility
		leagueName = league.Name
	} else if input.ClubID != nil {
		member, err := s.clubs.IsMember(ctx, *input.ClubID, userID)
		if err != nil {
			return nil, err
		}
		if !member {
			return nil, ErrPostDenied
		}
		club, err := s.clubs.GetByID(ctx, *input.ClubID, userID)
		if err != nil {
			return nil, err
		}
		input.Visibility = club.PostVisibility
		clubName = club.Name
	} else {
		if input.Visibility == "" {
			input.Visibility = model.PostVisibilityPublic
		}
		if !model.IsValidPostVisibility(input.Visibility) {
			return nil, ErrPostInvalidVisibility
		}
	}

	post, err := s.posts.Create(ctx, userID, input)
	if err != nil {
		return nil, err
	}

	// Fire activity event asynchronously. Use the resolved post visibility so
	// the public feed filter (which requires visibility = 'public') naturally
	// excludes members-only posts. The user's own privacy settings
	// (feed_opt_out, profile_visibility) further gate the public feed.
	targetType := "post"
	meta := model.PostCreatedMeta{
		BodyPreview: truncate(post.Body, 100),
		LeagueName:  leagueName,
		ClubName:    clubName,
	}
	for _, a := range post.Attachments {
		if a.TargetID != nil && meta.AttachmentType == "" && (a.Type == "score_card" || a.Type == "pellet_test") {
			meta.AttachmentType = a.Type
			meta.AttachmentTargetID = *a.TargetID
			continue
		}
		if a.Type == "image" && a.ImageURL != nil && *a.ImageURL != "" {
			meta.AttachmentImageURLs = append(meta.AttachmentImageURLs, *a.ImageURL)
		}
	}
	go s.activity.Ingest(context.Background(), userID, model.ActivityPostCreated, &post.ID, &targetType,
		meta, post.LeagueID, post.ClubID, post.Visibility)

	return post, nil
}

// GetByID retrieves a post by ID, enforcing visibility rules. A viewer is the
// author for owner-only operations. Hidden posts surface as ErrNotFound for
// non-authors; the author still sees the post so the UI can render a moderation
// banner. Platform admins (role == "admin") bypass visibility and hidden
// checks so they can review reported content from the admin reports queue.
func (s *PostService) GetByID(ctx context.Context, id string, viewerID *string, role string) (*model.Post, error) {
	post, err := s.posts.GetByID(ctx, id, viewerID)
	if err != nil {
		return nil, err
	}
	if role == "admin" {
		return post, nil
	}
	if ok, err := s.canViewPost(ctx, post, viewerID); err != nil {
		return nil, err
	} else if !ok {
		return nil, repository.ErrNotFound
	}
	return post, nil
}

// CanViewPostID loads the post and evaluates whether viewerID may see it. Used
// by services that already have the post ID (e.g. comments, likes) to enforce
// the same visibility rules as GetByID without duplicating logic. Returns
// repository.ErrNotFound for deny so callers can 404 instead of leaking existence.
func (s *PostService) CanViewPostID(ctx context.Context, postID string, viewerID *string) (*model.Post, error) {
	post, err := s.posts.GetByID(ctx, postID, viewerID)
	if err != nil {
		return nil, err
	}
	ok, err := s.canViewPost(ctx, post, viewerID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, repository.ErrNotFound
	}
	return post, nil
}

// canViewPost returns true when viewerID may see post. Authors always see their
// own content (including hidden); everyone else is gated on visibility and the
// hidden flag.
func (s *PostService) canViewPost(ctx context.Context, post *model.Post, viewerID *string) (bool, error) {
	if viewerID != nil && *viewerID == post.UserID {
		return true, nil
	}
	if post.HiddenAt != nil {
		return false, nil
	}
	visibility := post.Visibility
	if visibility == "" || visibility == model.PostVisibilityInherit {
		if post.LeagueID != nil || post.ClubID != nil {
			visibility = model.PostVisibilityMembers
		} else {
			visibility = model.PostVisibilityPublic
		}
	}
	switch visibility {
	case model.PostVisibilityPublic:
		return true, nil
	case model.PostVisibilityPrivate:
		return false, nil
	case model.PostVisibilityFollowers:
		if viewerID == nil {
			return false, nil
		}
		return s.social.IsFollowing(ctx, *viewerID, post.UserID)
	case model.PostVisibilityMembers:
		if viewerID == nil {
			return false, nil
		}
		if post.LeagueID != nil {
			isMember, err := s.leagues.IsMember(ctx, *post.LeagueID, *viewerID)
			if err != nil {
				return false, err
			}
			return isMember, nil
		}
		if post.ClubID != nil {
			isMember, err := s.clubs.IsMember(ctx, *post.ClubID, *viewerID)
			if err != nil {
				return false, err
			}
			return isMember, nil
		}
		return false, nil
	}
	return false, nil
}

// ListByLeague returns posts for a league. Private leagues are only visible
// to members; non-members receive repository.ErrNotFound.
func (s *PostService) ListByLeague(ctx context.Context, leagueID, viewerID string, limit, offset int) ([]*model.Post, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	league, err := s.leagues.GetByID(ctx, leagueID)
	if err != nil {
		return nil, err
	}
	if league.ClubID != nil && *league.ClubID != "" {
		if viewerID == "" {
			return nil, repository.ErrNotFound
		}
		isClubMember, err := s.clubs.IsMember(ctx, *league.ClubID, viewerID)
		if err != nil {
			return nil, err
		}
		if !isClubMember {
			return nil, repository.ErrNotFound
		}
	} else if league.Type == "private" {
		if viewerID == "" {
			return nil, repository.ErrNotFound
		}
		isMember, err := s.leagues.IsMember(ctx, leagueID, viewerID)
		if err != nil {
			return nil, err
		}
		if !isMember {
			return nil, repository.ErrNotFound
		}
	}
	return s.posts.ListByLeague(ctx, leagueID, limit, offset)
}

// ListByClub returns posts for a club. Private clubs are only visible to
// members; non-members receive repository.ErrNotFound.
func (s *PostService) ListByClub(ctx context.Context, clubID, viewerID string, limit, offset int) ([]*model.Post, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	club, err := s.clubs.GetByID(ctx, clubID, viewerID)
	if err != nil {
		return nil, err
	}
	if club.Type == "private" {
		if viewerID == "" {
			return nil, repository.ErrNotFound
		}
		isMember, err := s.clubs.IsMember(ctx, clubID, viewerID)
		if err != nil {
			return nil, err
		}
		if !isMember {
			return nil, repository.ErrNotFound
		}
	}
	return s.posts.ListByClub(ctx, clubID, limit, offset)
}

// Update edits a post owned by userID. A successful edit also clears any
// moderation flag on the post — the author's edit is treated as the
// amendment a moderator was asking for.
func (s *PostService) Update(ctx context.Context, id, userID, body string) (*model.Post, error) {
	body = strings.TrimSpace(body)
	if body == "" {
		return nil, ErrPostBodyEmpty
	}
	if len([]rune(body)) > 5000 {
		return nil, ErrPostBodyTooLong
	}
	post, err := s.posts.Update(ctx, id, userID, body)
	if err != nil {
		return nil, err
	}
	// Best-effort flag clear.
	_ = s.posts.SetPostFlag(ctx, id, nil, nil, nil, nil)
	if s.activity != nil {
		s.activity.SyncPostEdit(ctx, post.ID, post.Body, post.UpdatedAt)
	}
	return post, nil
}

// CanModeratePost returns the scope through which userID may moderate a post.
func (s *PostService) CanModeratePost(ctx context.Context, userID, role, postID string) (ModerationScope, error) {
	if role == "admin" {
		return ModerationScope{Scope: "global"}, nil
	}
	if userID == "" {
		return ModerationScope{}, nil
	}
	leagueID, clubID, err := s.posts.ResolvePostScope(ctx, postID)
	if err != nil {
		return ModerationScope{}, err
	}
	if leagueID != nil && *leagueID != "" {
		isAdmin, err := s.leagues.IsAdmin(ctx, *leagueID, userID)
		if err != nil {
			return ModerationScope{}, err
		}
		if isAdmin {
			return ModerationScope{Scope: "league", ScopeID: *leagueID}, nil
		}
	}
	if clubID != nil && *clubID != "" {
		isAdmin, err := s.clubs.IsAdmin(ctx, *clubID, userID)
		if err != nil {
			return ModerationScope{}, err
		}
		if isAdmin {
			return ModerationScope{Scope: "club", ScopeID: *clubID}, nil
		}
	}
	return ModerationScope{}, nil
}

// FlagPost marks a post as needing amendment.
func (s *PostService) FlagPost(ctx context.Context, userID, role, postID, reason string) error {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return ErrPostFlagReasonEmpty
	}
	if len([]rune(reason)) > 500 {
		reason = string([]rune(reason)[:500])
	}
	scope, err := s.CanModeratePost(ctx, userID, role, postID)
	if err != nil {
		return err
	}
	if scope.Scope == "" {
		return ErrPostForbidden
	}
	// Load the post first so we know the author for the notification and
	// have the league/club scope for downstream filtering.
	post, err := s.posts.GetByID(ctx, postID, nil)
	if err != nil {
		return err
	}
	scopeVal := scope.Scope
	var scopeIDPtr *string
	if scope.ScopeID != "" {
		scopeIDPtr = &scope.ScopeID
	}
	if err := s.posts.SetPostFlag(ctx, postID, &userID, &reason, &scopeVal, scopeIDPtr); err != nil {
		return err
	}
	if s.notifications != nil {
		targetType := "post"
		s.notifications.Fanout(ctx, NotifEvent{
			RecipientID: post.UserID,
			ActorID:     userID,
			Type:        model.NotificationTypePostFlagged,
			TargetID:    &post.ID,
			TargetType:  &targetType,
			LeagueID:    post.LeagueID,
			ClubID:      post.ClubID,
			Metadata:    map[string]any{"reason": reason},
		})
	}
	return nil
}

// UnflagPost clears the moderation flag on a post.
func (s *PostService) UnflagPost(ctx context.Context, userID, role, postID string) error {
	scope, err := s.CanModeratePost(ctx, userID, role, postID)
	if err != nil {
		return err
	}
	if scope.Scope == "" {
		return ErrPostForbidden
	}
	return s.posts.SetPostFlag(ctx, postID, nil, nil, nil, nil)
}

// Delete removes a post owned by userID.
func (s *PostService) Delete(ctx context.Context, id, userID string) error {
	if err := s.posts.Delete(ctx, id, userID); err != nil {
		return err
	}
	if s.activity != nil {
		s.activity.RemovePostFromFeed(ctx, id)
	}
	return nil
}

// Share creates a post with an attachment referencing a target entity.
func (s *PostService) Share(ctx context.Context, userID string, input *model.ShareInput) (*model.Post, error) {
	body := strings.TrimSpace(input.Body)
	if body == "" {
		body = " " // allow empty body for share posts — at minimum a space to satisfy NOT NULL
	}

	// Validate target type
	switch input.TargetType {
	case "score_card", "pellet_test":
		// Valid types
	default:
		return nil, errors.New("unsupported share target type")
	}

	createInput := &model.CreatePostInput{
		Body:       body,
		LeagueID:   input.LeagueID,
		ClubID:     input.ClubID,
		Visibility: input.Visibility,
		Attachments: []model.CreateAttachmentInput{
			{
				Type:     input.TargetType,
				TargetID: &input.TargetID,
			},
		},
	}

	return s.Create(ctx, userID, createInput)
}

func truncate(s string, maxLen int) string {
	runes := []rune(s)
	if len(runes) <= maxLen {
		return s
	}
	return string(runes[:maxLen]) + "…"
}
