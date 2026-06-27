package service

import (
	"context"
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

// SimulationRunner is the background goroutine that paces the activity
// simulation engine. Each tick it converts actions_per_hour into a per-tick
// budget (carrying the fractional remainder forward), applies the hourly
// multiplier for time-of-day shaping, and asks the service to perform that many
// actions, but only inside the configured active hours. It also records a tick
// heartbeat so operators can distinguish a live-but-idle runner from a stuck one.
type SimulationRunner struct {
	svc      *SimulationService
	log      zerolog.Logger
	interval time.Duration
	leftover float64
}

func NewSimulationRunner(svc *SimulationService, log zerolog.Logger) *SimulationRunner {
	return &SimulationRunner{svc: svc, log: log, interval: simulationTickInterval}
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

	performed, _, err := r.svc.RunOnce(ctx, n)
	if err != nil {
		r.log.Warn().Err(err).Msg("simulation: run failed")
		return
	}
	if performed > 0 {
		r.log.Info().Int("performed", performed).Float64("mult", mult).Msg("simulation tick")
	}
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
