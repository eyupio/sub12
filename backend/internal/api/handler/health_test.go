package handler_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/jnnngs/sub-12/backend/internal/api/handler"
)

type mockPinger struct{ err error }

func (m *mockPinger) Ping(_ context.Context) error { return m.err }

func TestLiveness(t *testing.T) {
	h := handler.NewHealth(&mockPinger{})
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()
	h.Liveness(rec, req)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestReadiness_Healthy(t *testing.T) {
	h := handler.NewHealth(&mockPinger{})
	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	rec := httptest.NewRecorder()
	h.Readiness(rec, req)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestReadiness_Unhealthy(t *testing.T) {
	h := handler.NewHealth(&mockPinger{err: context.DeadlineExceeded})
	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	rec := httptest.NewRecorder()
	h.Readiness(rec, req)
	assert.Equal(t, http.StatusServiceUnavailable, rec.Code)
}
