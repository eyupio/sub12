import { useState } from 'react'
import { Crosshair, X } from 'lucide-react'
import { mmToMOA } from '../utils/ballistics'
import { pelletDiameterMM } from '../utils/caliber'
import type { PelletTestImage, PelletTestMeasurement, PelletTestDetection } from '../api/pelletTesting'

interface Props {
  image: PelletTestImage
  measurement?: PelletTestMeasurement
  detections?: PelletTestDetection[]
  sessionDistanceM: number
  sessionDistanceUnit?: string
  onOpen: () => void
  onDelete: () => void
}

function resolveGroupMM(m: PelletTestMeasurement): number | null {
  return m.measured_size_mm ?? m.manual_group_size_mm ?? m.auto_group_size_mm ?? null
}

function resolveShotCount(m: PelletTestMeasurement, detections?: PelletTestDetection[]): number | null {
  if (m.manual_shot_count != null) return m.manual_shot_count
  if (detections && detections.length > 0) return detections.length
  if (m.detected_hole_count > 0) return m.detected_hole_count
  return null
}

export default function ScoredImageCard({
  image,
  measurement,
  detections,
  sessionDistanceM,
  sessionDistanceUnit,
  onOpen,
  onDelete,
}: Props) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)

  const scored = !!measurement
  const groupMM = measurement ? resolveGroupMM(measurement) : null
  const distanceM = measurement?.distance_m ?? sessionDistanceM
  const groupMOA = groupMM != null && distanceM > 0 ? mmToMOA(groupMM, distanceM) : null
  const shots = measurement ? resolveShotCount(measurement, detections) : null
  const displayDistanceUnit = measurement?.distance_unit ?? (sessionDistanceUnit === 'yards' ? 'yards' : 'meters')
  const displayDistanceValue = displayDistanceUnit === 'yards'
    ? Math.round((distanceM / 0.9144) * 10) / 10
    : Math.round(distanceM * 10) / 10
  const distanceLabel = displayDistanceUnit === 'yards' ? 'yd' : 'm'
  const rot = measurement?.rotation_degrees ?? 0
  const markerMM = measurement ? pelletDiameterMM(measurement.marker_size) : 0
  const impactRadiusPx = measurement && measurement.pixels_per_mm > 0
    ? (markerMM / 2) * measurement.pixels_per_mm
    : 0
  const strokeScale = natural ? Math.max(natural.w, natural.h) / 400 : 1

  return (
    <div className="relative group">
      <div className="relative aspect-square overflow-hidden rounded border border-subtle">
        <img
          src={image.image_url}
          alt=""
          className="w-full h-full object-cover cursor-pointer"
          style={rot ? { transform: `rotate(${rot}deg)` } : undefined}
          onClick={onOpen}
          onLoad={e => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        />
        {scored && natural && measurement && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox={`0 0 ${natural.w} ${natural.h}`}
            preserveAspectRatio="xMidYMid slice"
            style={rot ? { transform: `rotate(${rot}deg)` } : undefined}
          >
            {measurement.aim_point_x != null && measurement.aim_point_y != null && (
              <g stroke="#ef4444" strokeWidth={strokeScale} opacity={0.85}>
                <line x1={0} y1={measurement.aim_point_y} x2={natural.w} y2={measurement.aim_point_y} />
                <line x1={measurement.aim_point_x} y1={0} x2={measurement.aim_point_x} y2={natural.h} />
              </g>
            )}
            {measurement.point_a_x != null && measurement.point_a_y != null && (
              <circle
                cx={measurement.point_a_x}
                cy={measurement.point_a_y}
                r={8 * strokeScale}
                fill="rgba(234,179,8,0.35)"
                stroke="#eab308"
                strokeWidth={strokeScale * 1.5}
              />
            )}
            {measurement.point_b_x != null && measurement.point_b_y != null && (
              <circle
                cx={measurement.point_b_x}
                cy={measurement.point_b_y}
                r={8 * strokeScale}
                fill="rgba(234,179,8,0.35)"
                stroke="#eab308"
                strokeWidth={strokeScale * 1.5}
              />
            )}
            {measurement.measure_method === 'manual_line'
              && measurement.line_start_x != null && measurement.line_start_y != null
              && measurement.line_end_x != null && measurement.line_end_y != null && (
                <g stroke="#22c55e" strokeWidth={strokeScale * 2} fill="#22c55e">
                  <line
                    x1={measurement.line_start_x}
                    y1={measurement.line_start_y}
                    x2={measurement.line_end_x}
                    y2={measurement.line_end_y}
                  />
                  <circle cx={measurement.line_start_x} cy={measurement.line_start_y} r={5 * strokeScale} />
                  <circle cx={measurement.line_end_x} cy={measurement.line_end_y} r={5 * strokeScale} />
                </g>
              )}
            {measurement.measure_method !== 'manual_line' && detections && detections.map(d => (
              <g key={d.id} stroke="#ef4444" strokeWidth={strokeScale * 1.5}>
                <circle
                  cx={d.center_x}
                  cy={d.center_y}
                  r={impactRadiusPx > 0 ? impactRadiusPx : d.radius_pixels}
                  fill="rgba(239,68,68,0.18)"
                />
              </g>
            ))}
          </svg>
        )}
        {scored && (
          <span className="absolute top-1 left-1 bg-page/80 backdrop-blur px-1.5 py-0.5 rounded text-[10px] tracking-widest uppercase text-[var(--brass)]">
            Scored
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onOpen() }}
          className="absolute bottom-1 left-1 bg-page/80 backdrop-blur rounded-full p-1 text-[var(--brass)] opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Measure image"
          title="Open measurement tool"
        >
          <Crosshair size={14} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="absolute top-1 right-1 bg-page/80 backdrop-blur rounded-full p-0.5 text-muted hover:text-primary transition-colors"
          aria-label="Remove photo"
        >
          <X size={14} />
        </button>
      </div>
      {scored && (
        <div className="mt-1 grid grid-cols-2 gap-x-2 text-[10px] text-muted font-mono leading-tight">
          <span>{groupMM != null ? `${groupMM.toFixed(2)} mm` : '—'}</span>
          <span>{groupMOA != null ? `${(Math.round(groupMOA * 10) / 10).toFixed(1)} MOA` : '—'}</span>
          <span>{shots != null ? `${shots} shot${shots === 1 ? '' : 's'}` : '—'}</span>
          <span>{`${displayDistanceValue}${distanceLabel}`}</span>
        </div>
      )}
    </div>
  )
}
