import type { EventCourse, EventScoringRules } from '../api/events'

export interface DisciplinePreset {
  id: string
  label: string
  discipline: string
  course: EventCourse
  scoringRules: EventScoringRules
}

// Defaults mirror the standalone HFT/FT scorecard reference. They can be
// overridden in the create form via the "Custom" preset.
export const disciplinePresets: DisciplinePreset[] = [
  {
    id: 'hft',
    label: 'HFT (25 lanes × 2 shots)',
    discipline: 'HFT',
    course: { lanes: 25, shots_per_target: 2, standing_targets: [], kneeling_targets: [] },
    scoringRules: { mode: 'xo', points: { X: 1, O: 0 } },
  },
  {
    id: 'ft',
    label: 'FT (50 lanes × 1 shot)',
    discipline: 'FT',
    course: { lanes: 50, shots_per_target: 1, standing_targets: [], kneeling_targets: [] },
    scoringRules: { mode: 'xo', points: { X: 1, O: 0 } },
  },
  {
    id: 'ft-210',
    label: 'FT 2/1/0 (50 lanes)',
    discipline: 'FT',
    course: { lanes: 50, shots_per_target: 1, standing_targets: [], kneeling_targets: [] },
    scoringRules: { mode: '210', points: { '2': 2, '1': 1, '0': 0 } },
  },
]

export const customPreset: DisciplinePreset = {
  id: 'custom',
  label: 'Custom',
  discipline: 'HFT',
  course: { lanes: 10, shots_per_target: 1 },
  scoringRules: { mode: 'xo', points: { X: 1, O: 0 } },
}
