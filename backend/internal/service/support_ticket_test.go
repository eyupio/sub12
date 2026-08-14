package service

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

// Title/Description/Body all reach TEXT columns and fan out via
// notifications/email. Without per-field caps an authenticated user could
// POST a ~1 MiB blob and have it re-served on every ticket view. Validation
// runs before the repo call, so a nil repo is safe.
func TestSupportTicketService_LengthCaps(t *testing.T) {
	svc := NewSupportTicketService(nil, nil, nil, nil, nil, nil, "")
	ctx := context.Background()
	bigTitle := strings.Repeat("t", maxSupportTitleLen+1)
	bigBody := strings.Repeat("b", maxSupportBodyLen+1)
	base := model.CreateSupportTicketInput{ScopeType: model.SupportScopePlatform, Category: model.SupportCategoryQuestion, Title: "hi", Description: "hi"}
	titleIn, descIn := base, base
	titleIn.Title, descIn.Description = bigTitle, bigBody
	if _, err := svc.Create(ctx, "u", &titleIn); !errors.Is(err, ErrSupportTitleTooLong) {
		t.Fatalf("Create title: got %v", err)
	}
	if _, err := svc.Create(ctx, "u", &descIn); !errors.Is(err, ErrSupportBodyTooLong) {
		t.Fatalf("Create description: got %v", err)
	}
	if _, err := svc.AddMessage(ctx, "t", "u", &model.AddSupportTicketMessageInput{Body: bigBody}); !errors.Is(err, ErrSupportBodyTooLong) {
		t.Fatalf("AddMessage: got %v", err)
	}
}
