import type { EventDTO } from '../api/events'

/** Course summary: lanes only make sense for shot-grid events. */
export function courseLabel(ev: Pick<EventDTO, 'format' | 'course'>): string {
  if (ev.format === 'card_submission') return '25-shot cards'
  const n = ev.course.lanes
  return `${n} lane${n === 1 ? '' : 's'}`
}

/** "7 participants" or "7 of 20 places" when the event carries a capacity. */
export function participantsLabel(ev: Pick<EventDTO, 'participant_count' | 'max_participants'>): string {
  const n = ev.participant_count
  if (ev.max_participants) return `${n} of ${ev.max_participants} places`
  return `${n} participant${n === 1 ? '' : 's'}`
}

export function isEventFull(ev: Pick<EventDTO, 'participant_count' | 'max_participants'>): boolean {
  return !!ev.max_participants && ev.participant_count >= ev.max_participants
}
