package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestGeocodeService(t *testing.T, handler http.HandlerFunc) (*GeocodeService, *httptest.Server) {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	mr, err := miniredis.Run()
	require.NoError(t, err)
	t.Cleanup(mr.Close)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })
	return NewGeocodeService(srv.URL, "sub12-test", rdb, zerolog.Nop()), srv
}

const otleyResponse = `{
  "name": "Otley Sports Ground",
  "display_name": "Otley Sports Ground, Pool Road, Otley, West Yorkshire, LS21, United Kingdom",
  "address": {"leisure": "Otley Sports Ground", "town": "Otley", "county": "West Yorkshire", "country": "United Kingdom"}
}`

func TestGeocodeReverse_NamesTheVenueAndCachesIt(t *testing.T) {
	var calls int32
	svc, _ := newTestGeocodeService(t, func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		assert.Equal(t, "/reverse", r.URL.Path)
		assert.Equal(t, "53.862000", r.URL.Query().Get("lat"))
		assert.Equal(t, "-1.958000", r.URL.Query().Get("lon"))
		// Nominatim's usage policy requires an identifying User-Agent.
		assert.Equal(t, "sub12-test", r.Header.Get("User-Agent"))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(otleyResponse))
	})

	place, err := svc.Reverse(context.Background(), 53.862, -1.958)
	require.NoError(t, err)
	require.NotNil(t, place)
	assert.Equal(t, "Otley Sports Ground, Otley", place.Name)
	assert.Contains(t, place.Address, "Pool Road")

	// A second shooter on the same ground is served from the cache — the
	// point of the rounded key.
	again, err := svc.Reverse(context.Background(), 53.8624, -1.9578)
	require.NoError(t, err)
	require.NotNil(t, again)
	assert.Equal(t, "Otley Sports Ground, Otley", again.Name)
	assert.Equal(t, int32(1), atomic.LoadInt32(&calls))
}

func TestGeocodeReverse_UnnamedPointFallsBackToSettlement(t *testing.T) {
	svc, _ := newTestGeocodeService(t, func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"display_name":"A field, Burley in Wharfedale, West Yorkshire",
			"address":{"village":"Burley in Wharfedale","county":"West Yorkshire"}}`))
	})

	place, err := svc.Reverse(context.Background(), 53.91, -1.75)
	require.NoError(t, err)
	require.NotNil(t, place)
	assert.Equal(t, "Burley in Wharfedale, West Yorkshire", place.Name)
}

func TestGeocodeReverse_NowhereNamedIsNotAnError(t *testing.T) {
	var calls int32
	svc, _ := newTestGeocodeService(t, func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&calls, 1)
		_, _ = w.Write([]byte(`{"error":"Unable to geocode"}`))
	})

	place, err := svc.Reverse(context.Background(), 0, 0)
	require.NoError(t, err)
	assert.Nil(t, place)

	// The miss is cached too, so a mid-ocean coordinate can't be used to
	// hammer the upstream geocoder.
	place, err = svc.Reverse(context.Background(), 0, 0)
	require.NoError(t, err)
	assert.Nil(t, place)
	assert.Equal(t, int32(1), atomic.LoadInt32(&calls))
}

func TestGeocodeReverse_UpstreamFailureFallsBackQuietly(t *testing.T) {
	svc, _ := newTestGeocodeService(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	})

	place, err := svc.Reverse(context.Background(), 53.862, -1.958)
	require.NoError(t, err)
	assert.Nil(t, place)
}

func TestGeocodeReverse_DisabledAndOutOfRange(t *testing.T) {
	disabled := NewGeocodeService("", "sub12-test", nil, zerolog.Nop())
	assert.False(t, disabled.Enabled())
	_, err := disabled.Reverse(context.Background(), 53.862, -1.958)
	assert.ErrorIs(t, err, ErrGeocodeDisabled)

	svc, _ := newTestGeocodeService(t, func(w http.ResponseWriter, _ *http.Request) {
		t.Error("out-of-range coordinates should never reach the geocoder")
	})
	_, err = svc.Reverse(context.Background(), 100, 0)
	assert.Error(t, err)
}
