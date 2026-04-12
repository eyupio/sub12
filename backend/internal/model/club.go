package model

type Club struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	ImageURL    *string `json:"image_url,omitempty"`
	JoinCode    string  `json:"join_code"`
	CreatedBy   string  `json:"created_by"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
	MemberCount int     `json:"member_count"`
	IsAdmin     bool    `json:"is_admin,omitempty"`
	IsMember    bool    `json:"is_member,omitempty"`
}

type ClubMember struct {
	UserID      string  `json:"user_id"`
	DisplayName string  `json:"display_name"`
	AvatarURL   *string `json:"avatar_url,omitempty"`
	IsAdmin     bool    `json:"is_admin"`
	JoinedAt    string  `json:"joined_at"`
}

type ClubStanding struct {
	Rank        int     `json:"rank"`
	UserID      string  `json:"user_id"`
	DisplayName string  `json:"display_name"`
	AvatarURL   *string `json:"avatar_url,omitempty"`
	BestScore   *int16  `json:"best_score,omitempty"`
	BestX       *int16  `json:"best_x,omitempty"`
	CardCount   int     `json:"card_count"`
}

type CreateClubInput struct {
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
}
