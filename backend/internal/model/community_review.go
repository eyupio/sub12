package model

import "time"

// CommunityReviewRequest is an opt-in request, made by a card owner, for
// peer reviewers to confirm a personal practice score card. Confirmations
// themselves are stored in score_confirmations (reused from the league flow).
type CommunityReviewRequest struct {
	ID                    string     `json:"id"`
	ScoreCardID           string     `json:"score_card_id"`
	RequestedBy           string     `json:"requested_by"`
	RequiredConfirmations int16      `json:"required_confirmations"`
	Status                string     `json:"status"`
	CreatedAt             time.Time  `json:"created_at"`
	ResolvedAt            *time.Time `json:"resolved_at,omitempty"`
}

// CommunityReviewMeta is the JSONB metadata stored on the activity row when
// a community review is requested or completed. Lets the feed render the
// card preview and confirm CTA without a follow-up fetch.
type CommunityReviewMeta struct {
	TotalScore            int16   `json:"total_score"`
	XCount                int16   `json:"x_count"`
	RequiredConfirmations int16   `json:"required_confirmations"`
	CardImageURL          *string `json:"card_image_url,omitempty"`
}

// CommunityReviewStatusResponse is the GET shape returned to the frontend so
// the card detail page can render the right call-to-action and progress.
type CommunityReviewStatusResponse struct {
	Request            *CommunityReviewRequest `json:"request,omitempty"`
	Confirmations      []*ScoreConfirmation    `json:"confirmations"`
	ConfirmationCount  int                     `json:"confirmation_count"`
	ViewerHasConfirmed bool                    `json:"viewer_has_confirmed"`
}
