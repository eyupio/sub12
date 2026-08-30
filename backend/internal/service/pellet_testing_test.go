package service

import (
	"math"
	"testing"

	"github.com/jnnngs/sub-12/backend/internal/model"
	"github.com/stretchr/testify/require"
)

func floatPtr(v float64) *float64 { return &v }

func TestCalcMOA(t *testing.T) {
	tests := []struct {
		name        string
		groupSizeMM float64
		distanceM   float64
		want        float64
		tolerance   float64
	}{
		{
			// 1 MOA is a well-known ballistic reference constant: it subtends
			// approximately 1.047 inches at 100 yards, which converts to
			// ~29.089mm at 100m. Anchoring the test to this external constant
			// (rather than re-deriving the formula) catches unit-conversion or
			// degree/radian mistakes that a self-referential test would miss.
			name:        "one MOA at 100m matches the known ballistic constant",
			groupSizeMM: 29.089,
			distanceM:   100,
			want:        1.0,
			tolerance:   0.001,
		},
		{
			name:        "MOA scales linearly with group size at fixed distance",
			groupSizeMM: 58.178,
			distanceM:   100,
			want:        2.0,
			tolerance:   0.002,
		},
		{
			name:        "MOA scales inversely with distance at fixed group size",
			groupSizeMM: 29.089,
			distanceM:   50,
			want:        2.0,
			tolerance:   0.002,
		},
		{
			name:        "zero group size yields zero MOA",
			groupSizeMM: 0,
			distanceM:   100,
			want:        0,
			tolerance:   0.0001,
		},
		{
			name:        "zero distance is guarded and returns zero rather than dividing by zero",
			groupSizeMM: 25,
			distanceM:   0,
			want:        0,
			tolerance:   0.0001,
		},
		{
			name:        "negative distance is guarded and returns zero",
			groupSizeMM: 25,
			distanceM:   -10,
			want:        0,
			tolerance:   0.0001,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := calcMOA(tt.groupSizeMM, tt.distanceM)
			require.False(t, math.IsNaN(got), "calcMOA must never return NaN")
			require.False(t, math.IsInf(got, 0), "calcMOA must never return an infinite value")
			require.InDelta(t, tt.want, got, tt.tolerance)
		})
	}
}

func TestGroupSizeFromDetections(t *testing.T) {
	t.Run("computes CTC group size from a valid calibration", func(t *testing.T) {
		detections := []*model.PelletTestDetection{
			{CenterX: 0, CenterY: 0, RadiusPixels: 10, DiameterMM: floatPtr(4.5), Confidence: 0.9},
			{CenterX: 100, CenterY: 0, RadiusPixels: 10, DiameterMM: floatPtr(4.5), Confidence: 0.8},
		}
		groupMM, groupMOA, avgConf := groupSizeFromDetections(detections, 100)
		require.NotNil(t, groupMM)
		require.NotNil(t, groupMOA)
		require.NotNil(t, avgConf)
		// pixelsPerMM = 20/4.5; groupMM = 100/(20/4.5) + 4.5 = 27.0
		require.InDelta(t, 27.0, *groupMM, 0.001)
		require.InDelta(t, 0.85, *avgConf, 0.0001)
	})

	t.Run("a zero calibrated diameter is refused rather than reported as a perfect 0mm group", func(t *testing.T) {
		detections := []*model.PelletTestDetection{
			{CenterX: 0, CenterY: 0, RadiusPixels: 10, DiameterMM: floatPtr(0), Confidence: 0.9},
			{CenterX: 100, CenterY: 0, RadiusPixels: 10, DiameterMM: floatPtr(0), Confidence: 0.8},
		}
		groupMM, groupMOA, avgConf := groupSizeFromDetections(detections, 100)
		require.Nil(t, groupMM, "a diameter of exactly zero must not be treated as a valid calibration")
		require.Nil(t, groupMOA)
		require.NotNil(t, avgConf, "confidence is still computable even without a usable calibration")
	})

	t.Run("a missing calibration diameter yields no group size", func(t *testing.T) {
		detections := []*model.PelletTestDetection{
			{CenterX: 0, CenterY: 0, RadiusPixels: 10, DiameterMM: nil, Confidence: 0.9},
			{CenterX: 100, CenterY: 0, RadiusPixels: 10, DiameterMM: nil, Confidence: 0.8},
		}
		groupMM, groupMOA, avgConf := groupSizeFromDetections(detections, 100)
		require.Nil(t, groupMM)
		require.Nil(t, groupMOA)
		require.NotNil(t, avgConf)
	})
}
