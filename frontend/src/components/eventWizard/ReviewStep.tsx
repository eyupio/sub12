import { isCardSubmission, parseLaneList, type WizardState } from './wizardShared'

interface Props {
  state: WizardState
  clubId?: string
}

export function ReviewStep({ state, clubId }: Props) {
  const card = isCardSubmission(state)
  const standing = parseLaneList(state.course.standing)
  const kneeling = parseLaneList(state.course.kneeling)

  return (
    <section className="bg-surface border border-line rounded-lg p-5 lg:p-6 shadow-card space-y-4">
      <header>
        <h2 className="t-subsection-title">Review</h2>
        <p className="text-sm text-muted">Confirm the details. You can invite shooters in the next step.</p>
      </header>

      <Row label="Name" value={state.basics.name} />
      {state.basics.description && <Row label="Description" value={state.basics.description} />}
      {state.basics.location && <Row label="Location" value={state.basics.location} />}
      <Row label="Discipline" value={state.basics.discipline} />
      <Row label="Format" value={state.format.format === 'card_submission' ? 'Card submission' : 'Shot grid'} />
      <Row
        label="Visibility"
        value={
          state.format.visibility === 'public'
            ? 'Public'
            : state.format.visibility === 'club_only'
              ? 'Club only'
              : 'Unlisted'
        }
      />
      {clubId && <Row label="Hosted by" value="Club" />}
      {!card && (
        <>
          <Row label="Lanes" value={String(state.course.lanes)} />
          <Row label="Shots per target" value={String(state.course.shotsPerTarget)} />
          {standing.length > 0 && <Row label="Standing lanes" value={standing.join(', ')} />}
          {kneeling.length > 0 && <Row label="Kneeling lanes" value={kneeling.join(', ')} />}
        </>
      )}
      {card && (
        <>
          <Row
            label="Image required"
            value={state.verification.requireImageUpload ? 'Yes' : 'No'}
          />
          <Row
            label="Peer verification"
            value={
              state.verification.requireScoreVerification
                ? `Required (${state.verification.requiredConfirmations} confirmations)`
                : 'Not required'
            }
          />
          <Row
            label="Lock after verification"
            value={state.verification.lockEditsAfterVerification ? 'Yes' : 'No'}
          />
        </>
      )}
      <Row label="Categories" value={state.format.categoryIds.length === 0 ? '—' : `${state.format.categoryIds.length} selected`} />
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3 text-sm">
      <span className="t-section-title text-muted w-44 shrink-0">{label}</span>
      <span className="text-primary">{value}</span>
    </div>
  )
}
