package service

import (
	"context"
	"errors"
	"strings"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var (
	ErrPostBodyEmpty        = errors.New("post body cannot be empty")
	ErrPostBodyTooLong      = errors.New("post body exceeds maximum length of 5000 characters")
	ErrPostDenied           = errors.New("you do not have permission to post here")
	ErrPostInvalidVisibility = errors.New("invalid post visibility")
)

type PostService struct {
	posts    *repository.PostRepository
	leagues  *repository.LeagueRepository
	clubs    *repository.ClubRepository
	social   *repository.SocialRepository
	activity *ActivityService
}

func NewPostService(posts *repository.PostRepository, leagues *repository.LeagueRepository, clubs *repository.ClubRepository, social *repository.SocialRepository, activity *ActivityService) *PostService {
	return &PostService{posts: posts, leagues: leagues, clubs: clubs, social: social, activity: activity}
}

// Create validates and persists a new post.
func (s *PostService) Create(ctx context.Context, userID string, input *model.CreatePostInput) (*model.Post, error) {
	body := strings.TrimSpace(input.Body)
	if body == "" {
		return nil, ErrPostBodyEmpty
	}
	if len([]rune(body)) > 5000 {
		return nil, ErrPostBodyTooLong
	}
	input.Body = body

	if input.Visibility == "" {
		if input.LeagueID != nil || input.ClubID != nil {
			input.Visibility = model.PostVisibilityMembers
		} else {
			input.Visibility = model.PostVisibilityPublic
		}
	}
	if !model.IsValidPostVisibility(input.Visibility) {
		return nil, ErrPostInvalidVisibility
	}

	// Validate membership for scoped posts
	if input.LeagueID != nil {
		member, err := s.leagues.IsMember(ctx, *input.LeagueID, userID)
		if err != nil {
			return nil, err
		}
		if !member {
			return nil, ErrPostDenied
		}
	}
	if input.ClubID != nil {
		member, err := s.clubs.IsMember(ctx, *input.ClubID, userID)
		if err != nil {
			return nil, err
		}
		if !member {
			return nil, ErrPostDenied
		}
	}

	post, err := s.posts.Create(ctx, userID, input)
	if err != nil {
		return nil, err
	}

	// Fire activity event asynchronously
	targetType := "post"
	go s.activity.Ingest(context.Background(), userID, "post_created", &post.ID, &targetType,
		map[string]any{"body_preview": truncate(post.Body, 100)},
		post.LeagueID, post.ClubID, "public")

	return post, nil
}

// GetByID retrieves a post by ID, enforcing visibility rules. A viewer is the
// author for owner-only operations. Hidden posts surface as ErrNotFound for
// non-authors; the author still sees the post so the UI can render a moderation
// banner.
func (s *PostService) GetByID(ctx context.Context, id string, viewerID *string) (*model.Post, error) {
	post, err := s.posts.GetByID(ctx, id, viewerID)
	if err != nil {
		return nil, err
	}
	if ok, err := s.canViewPost(ctx, post, viewerID); err != nil {
		return nil, err
	} else if !ok {
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

// Update edits a post owned by userID.
func (s *PostService) Update(ctx context.Context, id, userID, body string) (*model.Post, error) {
	body = strings.TrimSpace(body)
	if body == "" {
		return nil, ErrPostBodyEmpty
	}
	if len([]rune(body)) > 5000 {
		return nil, ErrPostBodyTooLong
	}
	return s.posts.Update(ctx, id, userID, body)
}

// Delete removes a post owned by userID.
func (s *PostService) Delete(ctx context.Context, id, userID string) error {
	return s.posts.Delete(ctx, id, userID)
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
