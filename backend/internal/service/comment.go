package service

import (
	"context"
	"errors"
	"strings"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/jnnngs/sub-12/backend/internal/repository"
)

var (
	ErrCommentEmpty           = errors.New("comment body cannot be empty")
	ErrCommentTooLong         = errors.New("comment body exceeds maximum length of 2000 characters")
	ErrCommentDenied          = errors.New("you cannot comment on this content")
	ErrCommentForbidden       = errors.New("not authorized to moderate this comment")
	ErrCommentFlagReasonEmpty = errors.New("flag reason is required")
)

// ModerationScope describes the level of moderation privilege a user has over
// a piece of content. Scope == "" means no privilege.
type ModerationScope struct {
	Scope   string // "" | "league" | "club" | "global"
	ScopeID string // league_id or club_id; empty for global or none
}

type CommentService struct {
	comments        *repository.CommentRepository
	scoreCards      *ScoreCardService
	posts           *repository.PostRepository
	postSvc         *PostService
	blocks          *repository.BlockRepository
	leagues         *repository.LeagueRepository
	clubs           *repository.ClubRepository
	featureRequests *repository.FeatureRequestRepository
	activities      *repository.ActivityRepository
	achievements    *AchievementService // optional; nil disables achievement evaluation
}

func NewCommentService(
	comments *repository.CommentRepository,
	scoreCards *ScoreCardService,
	posts *repository.PostRepository,
	postSvc *PostService,
	blocks *repository.BlockRepository,
	leagues *repository.LeagueRepository,
	clubs *repository.ClubRepository,
	featureRequests *repository.FeatureRequestRepository,
	activities *repository.ActivityRepository,
	achievements *AchievementService,
) *CommentService {
	return &CommentService{
		comments:        comments,
		scoreCards:      scoreCards,
		posts:           posts,
		postSvc:         postSvc,
		blocks:          blocks,
		leagues:         leagues,
		clubs:           clubs,
		featureRequests: featureRequests,
		activities:      activities,
		achievements:    achievements,
	}
}

// blocked reports whether blockerID has blocked blockedID, short-circuiting to
// false when the two IDs are equal so callers never need a separate identity
// guard before calling this.
func (s *CommentService) blocked(ctx context.Context, blockerID, blockedID string) (bool, error) {
	if blockerID == blockedID {
		return false, nil
	}
	return s.blocks.IsBlocked(ctx, blockerID, blockedID)
}

func (s *CommentService) validateBody(body string) (string, error) {
	body = strings.TrimSpace(body)
	if body == "" {
		return "", ErrCommentEmpty
	}
	if len([]rune(body)) > 2000 {
		return "", ErrCommentTooLong
	}
	return body, nil
}

// Create validates input, verifies the target exists, and persists the comment.
func (s *CommentService) Create(ctx context.Context, targetID, targetType, userID, body string, parentID *string) (*model.Comment, error) {
	body, err := s.validateBody(body)
	if err != nil {
		return nil, err
	}

	// Validate target and check permissions based on target type
	switch targetType {
	case "score_card":
		card, err := s.scoreCards.GetForViewer(ctx, targetID, userID)
		if err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return nil, ErrCommentDenied
			}
			return nil, err
		}
		if card.UserID != userID {
			if blocked, err := s.blocked(ctx, card.UserID, userID); err != nil {
				return nil, err
			} else if blocked {
				return nil, ErrCommentDenied
			}
		}
	case "post":
		viewer := userID
		post, err := s.postSvc.CanViewPostID(ctx, targetID, &viewer)
		if err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return nil, ErrCommentDenied
			}
			return nil, err
		}
		if post.UserID != userID {
			if blocked, err := s.blocked(ctx, post.UserID, userID); err != nil {
				return nil, err
			} else if blocked {
				return nil, ErrCommentDenied
			}
		}
	case "feature_request":
		if s.featureRequests == nil {
			return nil, ErrCommentDenied
		}
		if _, err := s.featureRequests.GetByID(ctx, targetID, userID); err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return nil, ErrCommentDenied
			}
			return nil, err
		}
	case "activity":
		act, err := s.activities.GetByID(ctx, targetID)
		if err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return nil, ErrCommentDenied
			}
			return nil, err
		}
		if act.UserID != userID {
			if blocked, err := s.blocked(ctx, act.UserID, userID); err != nil {
				return nil, err
			} else if blocked {
				return nil, ErrCommentDenied
			}
		}
	default:
		return nil, errors.New("unsupported comment target type")
	}

	// If replying, validate parent exists and shares the same target
	if parentID != nil {
		parent, err := s.comments.GetByID(ctx, *parentID)
		if err != nil {
			return nil, err
		}
		if parent.TargetID != targetID || parent.TargetType != targetType {
			return nil, errors.New("parent comment does not belong to this target")
		}
	}

	comment, err := s.comments.Create(ctx, targetID, targetType, userID, body, parentID)
	if err != nil {
		return nil, err
	}

	if s.achievements != nil {
		go s.achievements.EvaluateForComment(context.Background(), userID)
	}

	return comment, nil
}

// ensureTargetVisible reports whether viewerID may read the comments attached
// to a target, returning repository.ErrNotFound when they may not so that
// existence is not leaked. viewerID may be empty for unauthenticated viewers.
func (s *CommentService) ensureTargetVisible(ctx context.Context, targetID, targetType, viewerID string) error {
	switch targetType {
	case "score_card":
		card, err := s.scoreCards.GetForViewer(ctx, targetID, viewerID)
		if err != nil {
			return err
		}
		if viewerID != "" && viewerID != card.UserID {
			if blocked, err := s.blocked(ctx, viewerID, card.UserID); err != nil {
				return err
			} else if blocked {
				return repository.ErrNotFound
			}
		}
	case "post":
		var viewerPtr *string
		if viewerID != "" {
			v := viewerID
			viewerPtr = &v
		}
		post, err := s.postSvc.CanViewPostID(ctx, targetID, viewerPtr)
		if err != nil {
			return err
		}
		if viewerID != "" && viewerID != post.UserID {
			if blocked, err := s.blocked(ctx, viewerID, post.UserID); err != nil {
				return err
			} else if blocked {
				return repository.ErrNotFound
			}
		}
	case "feature_request":
		if s.featureRequests == nil {
			return repository.ErrNotFound
		}
		if _, err := s.featureRequests.GetByID(ctx, targetID, viewerID); err != nil {
			return err
		}
	}
	return nil
}

// ListByTarget returns top-level comments for a target.
// viewerID may be empty for unauthenticated viewers; it is used to enforce
// visibility rules for private score cards and block checks.
func (s *CommentService) ListByTarget(ctx context.Context, targetID, targetType, viewerID string) ([]*model.Comment, error) {
	if err := s.ensureTargetVisible(ctx, targetID, targetType, viewerID); err != nil {
		return nil, err
	}
	return s.comments.ListByTargetWithViewer(ctx, targetID, targetType, viewerID)
}

// ListReplies returns replies to a specific comment. The parent's target
// decides who may read the thread: without this the replies to a comment on a
// card since made private — or by someone the owner has blocked — stayed
// readable to anyone holding the parent comment's id, while the card itself
// and its top-level comments had started answering 404.
func (s *CommentService) ListReplies(ctx context.Context, commentID, viewerID string) ([]*model.Comment, error) {
	parent, err := s.comments.GetByID(ctx, commentID)
	if err != nil {
		return nil, err
	}
	if err := s.ensureTargetVisible(ctx, parent.TargetID, parent.TargetType, viewerID); err != nil {
		return nil, err
	}
	return s.comments.ListRepliesWithViewer(ctx, commentID, viewerID)
}

// Update edits a comment owned by userID. A successful edit also clears any
// moderation flag on the comment — the author's edit is treated as the
// amendment a moderator was asking for.
func (s *CommentService) Update(ctx context.Context, commentID, userID, body string) (*model.Comment, error) {
	body, err := s.validateBody(body)
	if err != nil {
		return nil, err
	}
	comment, err := s.comments.Update(ctx, commentID, userID, body)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, repository.ErrNotFound
		}
		return nil, err
	}
	// Author editing a flagged comment satisfies the moderator's amendment
	// request. Best-effort: a clear failure should not fail the edit itself.
	_ = s.comments.SetCommentFlag(ctx, commentID, nil, nil, nil, nil)
	return comment, nil
}

// GetByID retrieves a single comment by ID.
func (s *CommentService) GetByID(ctx context.Context, commentID string) (*model.Comment, error) {
	return s.comments.GetByID(ctx, commentID)
}

// Delete removes a comment owned by userID.
func (s *CommentService) Delete(ctx context.Context, commentID, userID string) error {
	err := s.comments.Delete(ctx, commentID, userID)
	if errors.Is(err, repository.ErrNotFound) {
		return repository.ErrNotFound
	}
	return err
}

// CanModerateComment returns the scope through which userID is allowed to
// moderate a comment. An empty Scope means no authority.
func (s *CommentService) CanModerateComment(ctx context.Context, userID, role, commentID string) (ModerationScope, error) {
	if role == "admin" {
		return ModerationScope{Scope: "global"}, nil
	}
	if userID == "" {
		return ModerationScope{}, nil
	}
	leagueID, clubID, err := s.comments.ResolveCommentScope(ctx, commentID)
	if err != nil {
		return ModerationScope{}, err
	}
	if leagueID != nil && *leagueID != "" {
		role, err := s.leagues.GetMemberRole(ctx, *leagueID, userID)
		if err != nil {
			return ModerationScope{}, err
		}
		if role.Can(model.PermModerateContent) {
			return ModerationScope{Scope: "league", ScopeID: *leagueID}, nil
		}
	}
	if clubID != nil && *clubID != "" {
		role, err := s.clubs.GetMemberRole(ctx, *clubID, userID)
		if err != nil {
			return ModerationScope{}, err
		}
		if role.Can(model.PermModerateContent) {
			return ModerationScope{Scope: "club", ScopeID: *clubID}, nil
		}
	}
	return ModerationScope{}, nil
}

// FlagComment marks a comment as needing amendment and records who flagged it
// and why. Callable by global admins or by league/club admins whose group
// owns the target content.
func (s *CommentService) FlagComment(ctx context.Context, userID, role, commentID, reason string) error {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return ErrCommentFlagReasonEmpty
	}
	if len([]rune(reason)) > 500 {
		reason = string([]rune(reason)[:500])
	}
	scope, err := s.CanModerateComment(ctx, userID, role, commentID)
	if err != nil {
		return err
	}
	if scope.Scope == "" {
		return ErrCommentForbidden
	}
	scopeVal := scope.Scope
	var scopeIDPtr *string
	if scope.ScopeID != "" {
		scopeIDPtr = &scope.ScopeID
	}
	return s.comments.SetCommentFlag(ctx, commentID, &userID, &reason, &scopeVal, scopeIDPtr)
}

// UnflagComment clears the moderation flag. Authorized the same as FlagComment.
func (s *CommentService) UnflagComment(ctx context.Context, userID, role, commentID string) error {
	scope, err := s.CanModerateComment(ctx, userID, role, commentID)
	if err != nil {
		return err
	}
	if scope.Scope == "" {
		return ErrCommentForbidden
	}
	return s.comments.SetCommentFlag(ctx, commentID, nil, nil, nil, nil)
}
