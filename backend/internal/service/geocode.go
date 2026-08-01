package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	"github.com/jnnngs/sub-12/backend/internal/model"
)

// ErrGeocodeDisabled is returned when no geocoder is configured. Callers treat
// it as "no name available" rather than as a failure — the UI falls back to
// showing coordinates.
var ErrGeocodeDisabled = errors.New("reverse geocoding is not configured")

const (
	// Cached by rounded coordinate, so every shooter standing on the same
	// range costs one upstream lookup. Place names don't move, hence the
	// long TTL; a miss is retried the next day in case coverage improves.
	geocodeCacheTTL = 30 * 24 * time.Hour
	geocodeMissTTL  = 24 * time.Hour
	// Nominatim's usage policy caps us at one request per second.
	geocodeMinInterval = time.Second
	geocodeTimeout     = 6 * time.Second
	// Longest name we'll hand back — enough for "Bisley Ranges, Brookwood,
	// Surrey" without a full postal address running off the chip.
	geocodeMaxNameLen = 80
)

// GeocodeService resolves coordinates to a place name through a Nominatim
// endpoint. Results are cached in Redis and upstream calls are paced, so the
// shared public instance is never hit harder than its policy allows.
type GeocodeService struct {
	client    *http.Client
	rdb       *redis.Client
	log       zerolog.Logger
	baseURL   string
	userAgent string

	mu       sync.Mutex
	lastCall time.Time
}

func NewGeocodeService(baseURL, userAgent string, rdb *redis.Client, log zerolog.Logger) *GeocodeService {
	return &GeocodeService{
		client:    &http.Client{Timeout: geocodeTimeout},
		rdb:       rdb,
		log:       log,
		baseURL:   strings.TrimRight(baseURL, "/"),
		userAgent: userAgent,
	}
}

// Enabled reports whether a geocoder is configured.
func (s *GeocodeService) Enabled() bool { return s != nil && s.baseURL != "" }

// Reverse returns the place name for a coordinate, or nil when the geocoder
// knows of nowhere there. An upstream failure is also reported as nil so a
// flaky third party never blocks saving a card.
func (s *GeocodeService) Reverse(ctx context.Context, lat, lng float64) (*model.ReverseGeocode, error) {
	if !s.Enabled() {
		return nil, ErrGeocodeDisabled
	}
	if math.Abs(lat) > 90 || math.Abs(lng) > 180 {
		return nil, fmt.Errorf("coordinates out of range")
	}

	key := geocodeCacheKey(lat, lng)
	if cached, ok := s.fromCache(ctx, key); ok {
		return cached, nil
	}

	place, err := s.lookup(ctx, lat, lng)
	if err != nil {
		s.log.Warn().Err(err).Float64("lat", lat).Float64("lng", lng).
			Msg("reverse geocode failed")
		return nil, nil
	}
	s.toCache(ctx, key, place)
	return place, nil
}

// geocodeCacheKey rounds to three decimals (~110m), matching the radius within
// which we'd call two points the same place anyway.
func geocodeCacheKey(lat, lng float64) string {
	return fmt.Sprintf("geo:rev:%.3f,%.3f", lat, lng)
}

func (s *GeocodeService) fromCache(ctx context.Context, key string) (*model.ReverseGeocode, bool) {
	if s.rdb == nil {
		return nil, false
	}
	raw, err := s.rdb.Get(ctx, key).Result()
	if err != nil {
		return nil, false
	}
	if raw == "" {
		// Negative cache — the geocoder had no name for this point.
		return nil, true
	}
	var place model.ReverseGeocode
	if err := json.Unmarshal([]byte(raw), &place); err != nil {
		return nil, false
	}
	return &place, true
}

func (s *GeocodeService) toCache(ctx context.Context, key string, place *model.ReverseGeocode) {
	if s.rdb == nil {
		return
	}
	if place == nil {
		_ = s.rdb.Set(ctx, key, "", geocodeMissTTL).Err()
		return
	}
	raw, err := json.Marshal(place)
	if err != nil {
		return
	}
	_ = s.rdb.Set(ctx, key, raw, geocodeCacheTTL).Err()
}

// wait paces upstream calls to one per second. It returns the context's error
// if the caller gives up while queued.
func (s *GeocodeService) wait(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	gap := time.Until(s.lastCall.Add(geocodeMinInterval))
	if gap > 0 {
		timer := time.NewTimer(gap)
		defer timer.Stop()
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-timer.C:
		}
	}
	s.lastCall = time.Now()
	return nil
}

type nominatimAddress struct {
	Amenity       string `json:"amenity"`
	Leisure       string `json:"leisure"`
	Hamlet        string `json:"hamlet"`
	Village       string `json:"village"`
	Town          string `json:"town"`
	Suburb        string `json:"suburb"`
	CityDistrict  string `json:"city_district"`
	City          string `json:"city"`
	Municipality  string `json:"municipality"`
	County        string `json:"county"`
	StateDistrict string `json:"state_district"`
	State         string `json:"state"`
	Country       string `json:"country"`
}

type nominatimResult struct {
	Name        string           `json:"name"`
	DisplayName string           `json:"display_name"`
	Address     nominatimAddress `json:"address"`
	Error       string           `json:"error"`
}

func (s *GeocodeService) lookup(ctx context.Context, lat, lng float64) (*model.ReverseGeocode, error) {
	if err := s.wait(ctx); err != nil {
		return nil, err
	}

	q := url.Values{}
	q.Set("format", "jsonv2")
	q.Set("lat", fmt.Sprintf("%.6f", lat))
	q.Set("lon", fmt.Sprintf("%.6f", lng))
	// Zoom 16 lands on the building/venue the point sits on, falling back to
	// the settlement — a shooting ground gets its own name, a field gets the
	// nearest village.
	q.Set("zoom", "16")
	q.Set("addressdetails", "1")
	q.Set("accept-language", "en")

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.baseURL+"/reverse?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", s.userAgent)
	req.Header.Set("Accept", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("geocoder returned %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	if err != nil {
		return nil, err
	}
	var res nominatimResult
	if err := json.Unmarshal(body, &res); err != nil {
		return nil, err
	}
	if res.Error != "" {
		return nil, nil
	}
	return placeFromNominatim(res), nil
}

// placeFromNominatim composes the label. A named venue wins — that is the name
// a shooter would use — narrowed by its settlement; otherwise the settlement
// and its county stand in.
func placeFromNominatim(res nominatimResult) *model.ReverseGeocode {
	a := res.Address
	venue := firstNonEmpty(res.Name, a.Leisure, a.Amenity)
	locality := firstNonEmpty(a.Village, a.Town, a.Hamlet, a.Suburb, a.CityDistrict, a.City, a.Municipality)
	region := firstNonEmpty(a.County, a.StateDistrict, a.State)

	parts := make([]string, 0, 2)
	switch {
	case venue != "":
		parts = append(parts, venue)
		if locality != "" && !strings.EqualFold(locality, venue) {
			parts = append(parts, locality)
		} else if region != "" {
			parts = append(parts, region)
		}
	case locality != "":
		parts = append(parts, locality)
		if region != "" && !strings.EqualFold(region, locality) {
			parts = append(parts, region)
		}
	case region != "":
		parts = append(parts, region)
	}
	name := strings.Join(parts, ", ")
	if name == "" {
		return nil
	}
	if len(name) > geocodeMaxNameLen {
		name = strings.TrimSpace(name[:geocodeMaxNameLen])
	}
	return &model.ReverseGeocode{Name: name, Address: res.DisplayName}
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}
