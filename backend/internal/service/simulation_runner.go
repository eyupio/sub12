package service

import (
	"context"
	"math/rand"
	"sort"
	"time"

	"github.com/rs/zerolog"

	"github.com/jnnngs/sub-12/backend/internal/repository"
)

// simulationTickInterval is how often the runner wakes to perform a slice of
// the configured hourly action budget.
const simulationTickInterval = time.Minute

// maxActionsPerTick caps how much work a single tick performs, bounding load
// even if actions_per_hour is set very high.
const maxActionsPerTick = 250

// simulationSpreadFraction is the portion of a tick interval over which a
// tick's actions are scattered. Keeping it below 1.0 leaves headroom for the
// actions themselves to execute before the next tick fires.
const simulationSpreadFraction = 0.85

// SimulationRunner is the background goroutine that paces the activity
// simulation engine. Each tick it converts actions_per_hour into a per-tick
// budget (carrying the fractional remainder forward), applies the hourly
// multiplier for time-of-day shaping, and asks the service to perform that many
// actions, but only inside the configured active hours. Those actions are
// scattered across the tick window at randomized times rather than fired in a
// single burst, so simulated activity trickles into the feed naturally. It also
// records a tick heartbeat so operators can distinguish a live-but-idle runner
// from a stuck one.
type SimulationRunner struct {
	svc      *SimulationService
	log      zerolog.Logger
	interval time.Duration
	leftover float64
	rng      *rand.Rand
}

func NewSimulationRunner(svc *SimulationService, log zerolog.Logger) *SimulationRunner {
	return &SimulationRunner{
		svc:      svc,
		log:      log,
		interval: simulationTickInterval,
		rng:      rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

func (r *SimulationRunner) Run(ctx context.Context) {
	ticker := time.NewTicker(r.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			r.tick(ctx)
		}
	}
}

func (r *SimulationRunner) tick(ctx context.Context) {
	settings, err := r.svc.GetSettings(ctx)
	if err != nil {
		if err != repository.ErrNotFound {
			r.log.Warn().Err(err).Msg("simulation: load settings failed")
		}
		return
	}

	// Always record a heartbeat so admins can see the runner is alive even
	// when idle (disabled / outside active hours).
	if err := r.svc.repo.TouchTick(ctx); err != nil {
		r.log.Warn().Err(err).Msg("simulation: touch tick failed")
	}

	if !settings.Enabled || settings.ActionsPerHour <= 0 {
		r.leftover = 0
		return
	}
	hour := time.Now().UTC().Hour()
	if !withinActiveHours(hour, settings.ActiveStartHour, settings.ActiveEndHour) {
		r.leftover = 0
		return
	}

	mult := hourlyMultiplier(settings.HourlyMultipliers, hour)
	budget := float64(settings.ActionsPerHour)*r.interval.Hours()*mult + r.leftover
	n := int(budget)
	r.leftover = budget - float64(n)
	if n <= 0 {
		return
	}
	if n > maxActionsPerTick {
		n = maxActionsPerTick
	}

	r.performSpread(ctx, n, mult)
}

// performSpread performs n actions one at a time, scattering them across the
// tick window at randomized arrival times instead of firing them all at the
// same instant. This stops a tick's worth of activity from landing on the feed
// as a single burst (and the same persona from appearing to spam it), making
// simulated activity trickle in more naturally. Each action runs as its own
// RunOnce call so the action lock is released between actions, keeping the
// admin "run now" path responsive and letting a mid-tick disable take effect
// promptly.
func (r *SimulationRunner) performSpread(ctx context.Context, n int, mult float64) {
	window := time.Duration(float64(r.interval) * simulationSpreadFraction)
	offsets := spreadOffsets(window, n, r.rng)

	performed := 0
	var elapsed time.Duration
	for _, off := range offsets {
		if wait := off - elapsed; wait > 0 {
			select {
			case <-ctx.Done():
				return
			case <-time.After(wait):
				elapsed = off
			}
		}
		done, _, err := r.svc.RunOnce(ctx, 1)
		if err != nil {
			r.log.Warn().Err(err).Msg("simulation: run failed")
			return
		}
		performed += done
	}
	if performed > 0 {
		r.log.Info().Int("performed", performed).Float64("mult", mult).Msg("simulation tick")
	}
}

// spreadOffsets returns n delays in [0, window), sorted ascending, giving each
// action a random arrival time within the spread window. Uniformly random
// offsets produce irregular gaps between actions, which reads more naturally
// than a fixed cadence.
func spreadOffsets(window time.Duration, n int, rng *rand.Rand) []time.Duration {
	offsets := make([]time.Duration, n)
	for i := range offsets {
		offsets[i] = time.Duration(rng.Float64() * float64(window))
	}
	sort.Slice(offsets, func(i, j int) bool { return offsets[i] < offsets[j] })
	return offsets
}

// hourlyMultiplier returns the time-of-day shaping factor for hour (0-23) from
// the settings slice. Falls back to 1.0 when the slice is missing/short.
func hourlyMultiplier(mults []float64, hour int) float64 {
	if hour < 0 || hour > 23 || len(mults) == 0 {
		return 1.0
	}
	if hour >= len(mults) {
		return 1.0
	}
	v := mults[hour]
	if v < 0 {
		return 0
	}
	return v
}

// withinActiveHours reports whether hour (0-23) falls in [start, end). end is
// exclusive and may be 24 (whole day). Supports wrap-around windows where
// start > end (e.g. 20–6 spans overnight).
func withinActiveHours(hour, start, end int) bool {
	if start == end {
		return true
	}
	if start < end {
		return hour >= start && hour < end
	}
	// Wrap-around window.
	return hour >= start || hour < end
}
