package service

import (
	"context"
	"errors"
	"strings"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var (
	ErrPostBodyEmpty   = errors.New("post body cannot be empty")
	ErrPostBodyTooLong = errors.New("post body exceeds maximum length of 5000 characters")
	ErrPostDenied      = errors.New("you do not have permission to post here")
)

type PostService struct {
	posts    *repository.PostRepository
	leagues  *repository.LeagueRepository
	clubs    *repository.ClubRepository
	activity *ActivityService
}

func NewPostService(posts *repository.PostRepository, leagues *repository.LeagueRepository, clubs *repository.ClubRepository, activity *ActivityService) *PostService {
	return &PostService{posts: posts, leagues: leagues, clubs: clubs, activity: activity}
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

// GetByID retrieves a post by ID.
func (s *PostService) GetByID(ctx context.Context, id string, viewerID *string) (*model.Post, error) {
	return s.posts.GetByID(ctx, id, viewerID)
}

// ListByLeague returns posts for a league.
func (s *PostService) ListByLeague(ctx context.Context, leagueID string, limit, offset int) ([]*model.Post, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	return s.posts.ListByLeague(ctx, leagueID, limit, offset)
}

// ListByClub returns posts for a club.
func (s *PostService) ListByClub(ctx context.Context, clubID string, limit, offset int) ([]*model.Post, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
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
		Body:     body,
		LeagueID: input.LeagueID,
		ClubID:   input.ClubID,
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
