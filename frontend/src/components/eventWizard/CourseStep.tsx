import {
  WIZARD_INPUT_CLS,
  WIZARD_LABEL_CLS,
  isCardSubmission,
  type WizardState,
} from './wizardShared'

interface Props {
  state: WizardState
  onChange: (next: WizardState) => void
}

export function CourseStep({ state, onChange }: Props) {
  const card = isCardSubmission(state)
  const { course } = state

  return (
    <section className="bg-surface border border-line rounded-lg p-5 lg:p-6 shadow-card space-y-5">
      <header>
        <h2 className="t-subsection-title">Course</h2>
        <p className="text-sm text-muted">
          {card
            ? 'Card-submission events use a fixed 25-shot card per shooter; lanes don’t apply.'
            : 'Lay out the lanes, shots per target, and any positional assignments.'}
        </p>
      </header>

      <label className="block">
        <span className={WIZARD_LABEL_CLS}>Max participants (optional)</span>
        <input
          type="number"
          min={1}
          max={5000}
          className={WIZARD_INPUT_CLS}
          placeholder="No limit"
          value={course.maxParticipants}
          onChange={(e) =>
            onChange({ ...state, course: { ...course, maxParticipants: e.target.value } })
          }
        />
        <span className="block mt-1 text-xs text-muted">
          Joining closes once this many shooters (including guests) have entered. Leave empty for no limit.
        </span>
      </label>

      {card ? (
        <p className="text-sm text-muted">No course settings to configure for card submission.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <label className="block">
              <span className={WIZARD_LABEL_CLS}>Lanes</span>
              <input
                type="number"
                min={1}
                max={200}
                className={WIZARD_INPUT_CLS}
                value={course.lanes}
                onChange={(e) =>
                  onChange({ ...state, course: { ...course, lanes: Number.parseInt(e.target.value || '0', 10) } })
                }
              />
            </label>

            <label className="block">
              <span className={WIZARD_LABEL_CLS}>Shots per target</span>
              <input
                type="number"
                min={1}
                max={10}
                className={WIZARD_INPUT_CLS}
                value={course.shotsPerTarget}
                onChange={(e) =>
                  onChange({
                    ...state,
                    course: { ...course, shotsPerTarget: Number.parseInt(e.target.value || '0', 10) },
                  })
                }
              />
            </label>
          </div>

          <label className="block">
            <span className={WIZARD_LABEL_CLS}>Standing lanes (optional)</span>
            <input
              className={WIZARD_INPUT_CLS}
              placeholder="e.g. 1, 4, 5"
              value={course.standing}
              onChange={(e) => onChange({ ...state, course: { ...course, standing: e.target.value } })}
            />
          </label>

          <label className="block">
            <span className={WIZARD_LABEL_CLS}>Kneeling lanes (optional)</span>
            <input
              className={WIZARD_INPUT_CLS}
              placeholder="e.g. 7, 12"
              value={course.kneeling}
              onChange={(e) => onChange({ ...state, course: { ...course, kneeling: e.target.value } })}
            />
          </label>
        </>
      )}
    </section>
  )
}
