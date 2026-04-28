import { WIZARD_INPUT_CLS, WIZARD_LABEL_CLS, type WizardState } from './wizardShared'

interface Props {
  state: WizardState
  onChange: (next: WizardState) => void
}

export function VerificationStep({ state, onChange }: Props) {
  const v = state.verification
  return (
    <section className="bg-surface border border-line rounded-lg p-5 lg:p-6 shadow-card space-y-4">
      <header>
        <h2 className="t-subsection-title">Card verification</h2>
        <p className="text-sm text-muted">How submitted score cards are verified before they count.</p>
      </header>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={v.requireImageUpload}
          onChange={(e) =>
            onChange({ ...state, verification: { ...v, requireImageUpload: e.target.checked } })
          }
        />
        Require a card image upload before submission is accepted
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={v.requireScoreVerification}
          onChange={(e) =>
            onChange({ ...state, verification: { ...v, requireScoreVerification: e.target.checked } })
          }
        />
        Require peer verification (cards stay pending until confirmed)
      </label>

      {v.requireScoreVerification && (
        <label className="block">
          <span className={WIZARD_LABEL_CLS}>Required confirmations</span>
          <input
            type="number"
            min={0}
            max={10}
            className={WIZARD_INPUT_CLS}
            value={v.requiredConfirmations}
            onChange={(e) =>
              onChange({
                ...state,
                verification: {
                  ...v,
                  requiredConfirmations: Number.parseInt(e.target.value || '0', 10),
                },
              })
            }
          />
        </label>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={v.lockEditsAfterVerification}
          onChange={(e) =>
            onChange({
              ...state,
              verification: { ...v, lockEditsAfterVerification: e.target.checked },
            })
          }
        />
        Lock edits once a card is verified
      </label>
    </section>
  )
}
