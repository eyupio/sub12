import type { CreateEventPayload, EventFormat, EventVisibility } from '../../api/events'
import { customPreset, disciplinePresets } from '../../config/disciplinePresets'

export const WIZARD_INPUT_CLS =
  'w-full bg-surface border border-subtle rounded px-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-[var(--gold)]/50 transition-colors'

export const WIZARD_LABEL_CLS = 't-section-title block mb-1.5'

export function toggleCls(active: boolean): string {
  return `px-3 py-1.5 rounded border text-[11px] tracking-widest uppercase transition-colors ${
    active
      ? 'border-[var(--gold)]/50 bg-[var(--gold-tint)] text-[var(--gold)]'
      : 'border-subtle text-muted hover:text-secondary'
  }`
}

export interface WizardBasics {
  name: string
  description: string
  location: string
  presetId: string
  discipline: string
}

export interface WizardFormat {
  format: EventFormat
  visibility: EventVisibility
  categoryIds: string[]
}

export interface WizardCourse {
  lanes: number
  shotsPerTarget: number
  standing: string
  kneeling: string
}

export interface WizardVerification {
  requireScoreVerification: boolean
  requiredConfirmations: number
  requireImageUpload: boolean
  lockEditsAfterVerification: boolean
}

export interface WizardState {
  basics: WizardBasics
  format: WizardFormat
  course: WizardCourse
  verification: WizardVerification
}

export const initialState = (clubId?: string): WizardState => {
  const preset = disciplinePresets[0]
  return {
    basics: {
      name: '',
      description: '',
      location: '',
      presetId: preset.id,
      discipline: preset.discipline,
    },
    format: {
      format: preset.format,
      visibility: clubId ? 'club_only' : 'public',
      categoryIds: [],
    },
    course: {
      lanes: preset.course.lanes,
      shotsPerTarget: preset.course.shots_per_target,
      standing: '',
      kneeling: '',
    },
    verification: {
      requireScoreVerification: false,
      requiredConfirmations: 1,
      requireImageUpload: true,
      lockEditsAfterVerification: true,
    },
  }
}

export function applyPreset(state: WizardState, presetId: string): WizardState {
  const p = disciplinePresets.find((x) => x.id === presetId) ?? customPreset
  return {
    ...state,
    basics: { ...state.basics, presetId, discipline: p.discipline },
    format: { ...state.format, format: p.format },
    course: {
      ...state.course,
      lanes: p.course.lanes,
      shotsPerTarget: p.course.shots_per_target,
      standing: '',
      kneeling: '',
    },
  }
}

export function parseLaneList(input: string): number[] {
  if (!input.trim()) return []
  const out: number[] = []
  const seen = new Set<number>()
  for (const part of input.split(/[,\s]+/g)) {
    if (!part) continue
    const n = Number.parseInt(part, 10)
    if (Number.isFinite(n) && n > 0 && !seen.has(n)) {
      seen.add(n)
      out.push(n)
    }
  }
  return out.sort((a, b) => a - b)
}

export function isCardSubmission(state: WizardState): boolean {
  return state.format.format === 'card_submission'
}

export function basicsValid(s: WizardState): boolean {
  return s.basics.name.trim().length > 0 && s.basics.discipline.trim().length > 0
}

export function formatValid(s: WizardState): boolean {
  return s.format.format === 'shot_grid' || s.format.format === 'card_submission'
}

export function courseValid(s: WizardState): boolean {
  if (isCardSubmission(s)) return true
  return s.course.lanes >= 1 && s.course.lanes <= 200 && s.course.shotsPerTarget >= 1 && s.course.shotsPerTarget <= 10
}

export function buildCreatePayload(s: WizardState, clubId?: string): CreateEventPayload {
  const card = isCardSubmission(s)
  const preset = disciplinePresets.find((p) => p.id === s.basics.presetId) ?? customPreset
  const payload: CreateEventPayload = {
    name: s.basics.name.trim(),
    description: s.basics.description.trim() || undefined,
    location: s.basics.location.trim() || undefined,
    discipline: s.basics.discipline.trim(),
    format: s.format.format,
    course: card
      ? { lanes: 1, shots_per_target: 25 }
      : {
          lanes: s.course.lanes,
          shots_per_target: s.course.shotsPerTarget,
          standing_targets: parseLaneList(s.course.standing),
          kneeling_targets: parseLaneList(s.course.kneeling),
        },
    scoring_rules: preset.scoringRules,
    category_ids: s.format.categoryIds,
    visibility: s.format.visibility,
    club_id: clubId,
  }
  if (card) {
    payload.require_score_verification = s.verification.requireScoreVerification
    payload.required_confirmations = s.verification.requiredConfirmations
    payload.require_image_upload = s.verification.requireImageUpload
    payload.lock_edits_after_verification = s.verification.lockEditsAfterVerification
  }
  return payload
}

export const DRAFT_KEY = 'sub12.eventCreate.draft'
