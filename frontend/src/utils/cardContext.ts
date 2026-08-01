/**
 * A score card sits in exactly one context: a personal card, a league entry,
 * or a club card. Quick capture asks for it at the start, but the answer has
 * to stay changeable — a card captured against the wrong league, or one whose
 * round filled up, must be movable without being re-shot.
 */
export type CardContext = 'personal' | 'league' | 'club'

export function contextOfCard(card: {
  league_round_id?: string
  club_id?: string
}): CardContext {
  if (card.league_round_id) return 'league'
  if (card.club_id) return 'club'
  return 'personal'
}

export interface ContextChangePlanInput {
  target: CardContext
  /** The round the target league resolves to; undefined until it's known. */
  targetRoundId?: string | null
  targetClubId?: string | null
  currentRoundId?: string
  currentClubId?: string
}

export interface ContextChangePlan {
  /**
   * PATCH fields, following the "omit to keep, empty string to clear"
   * convention. Attaching to a round is never a PATCH — the backend refuses it
   * there so the membership and cap checks can't be bypassed.
   */
  patch: { league_round_id?: string; club_id?: string }
  /** Round to POST to submit-to-league after the PATCH, if any. */
  submitRoundId?: string
  /** True when the target is a league but no round is known yet. */
  needsRound: boolean
}

/**
 * Works out what to send to move a card into `target`. Leaving a league always
 * goes through the PATCH detach; joining or changing one always goes through
 * submit-to-league, which is where membership, the submission cap and the
 * league's image rule are enforced.
 */
export function contextChangePlan(input: ContextChangePlanInput): ContextChangePlan {
  const { target, targetRoundId, targetClubId, currentRoundId, currentClubId } = input
  const patch: { league_round_id?: string; club_id?: string } = {}

  if (target === 'league') {
    if (!targetRoundId) return { patch, needsRound: true }
    return {
      patch,
      submitRoundId: targetRoundId === currentRoundId ? undefined : targetRoundId,
      needsRound: false,
    }
  }

  // Personal and club cards are both out of any league round.
  if (currentRoundId) patch.league_round_id = ''

  if (target === 'club') {
    const next = targetClubId ?? ''
    if (next && next !== currentClubId) patch.club_id = next
  } else if (currentClubId) {
    patch.club_id = ''
  }

  return { patch, needsRound: false }
}
