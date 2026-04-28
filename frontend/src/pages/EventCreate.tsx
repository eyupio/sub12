import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import { eventsApi, type EventDTO } from '../api/events'
import { WizardShell } from '../components/wizard/WizardShell'
import type { WizardStepDescriptor } from '../components/wizard/WizardStepper'
import { BasicsStep } from '../components/eventWizard/BasicsStep'
import { FormatStep } from '../components/eventWizard/FormatStep'
import { CourseStep } from '../components/eventWizard/CourseStep'
import { VerificationStep } from '../components/eventWizard/VerificationStep'
import { ReviewStep } from '../components/eventWizard/ReviewStep'
import { InviteStep } from '../components/eventWizard/InviteStep'
import {
  DRAFT_KEY,
  basicsValid,
  buildCreatePayload,
  courseValid,
  formatValid,
  initialState,
  isCardSubmission,
  type WizardState,
} from '../components/eventWizard/wizardShared'
import { useSmartBack } from '../hooks/useSmartBack'
import { toast } from '../store/toast'

const STEPS = ['basics', 'format', 'course', 'verification', 'review', 'invite'] as const
type StepKey = (typeof STEPS)[number]

const LABELS: Record<StepKey, string> = {
  basics: 'Basics',
  format: 'Format',
  course: 'Course',
  verification: 'Verification',
  review: 'Review',
  invite: 'Invite',
}

function readDraft(): WizardState | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as WizardState
  } catch {
    /* ignore */
  }
  return null
}

function writeDraft(state: WizardState): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* ignore */
  }
}

export default function EventCreate() {
  const navigate = useNavigate()
  const smartBack = useSmartBack('/events')
  const search = useSearch({ strict: false }) as { clubId?: string; step?: number }
  const clubId = search.clubId

  const [state, setState] = useState<WizardState>(() => readDraft() ?? initialState(clubId))
  const [createdEvent, setCreatedEvent] = useState<EventDTO | null>(null)
  const [stepIndex, setStepIndex] = useState<number>(() => {
    if (typeof search.step === 'number' && search.step >= 1 && search.step <= STEPS.length) return search.step - 1
    return 0
  })

  // Persist draft to localStorage on every change (until event is created).
  useEffect(() => {
    if (createdEvent) return
    writeDraft(state)
  }, [state, createdEvent])

  // Visible steps: skip 'verification' when format is shot_grid.
  const visibleSteps = useMemo<StepKey[]>(() => {
    return STEPS.filter((k) => (k === 'verification' ? isCardSubmission(state) : true))
  }, [state])

  const stepKey: StepKey = visibleSteps[Math.min(stepIndex, visibleSteps.length - 1)]
  const isLast = stepIndex === visibleSteps.length - 1
  const onReview = stepKey === 'review'

  const goToStep = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(visibleSteps.length - 1, idx))
      setStepIndex(clamped)
    },
    [visibleSteps.length],
  )

  const createMutation = useMutation({
    mutationFn: () => eventsApi.create(buildCreatePayload(state, clubId)),
    onSuccess: (ev) => {
      setCreatedEvent(ev)
      clearDraft()
      toast('Event created', 'success')
      goToStep(visibleSteps.indexOf('invite'))
    },
    onError: (err) => toast(err instanceof Error ? err.message : 'Failed to create event', 'error'),
  })

  const finish = useCallback(() => {
    if (createdEvent) {
      navigate({ to: '/events/$slug', params: { slug: createdEvent.slug } })
    }
  }, [createdEvent, navigate])

  const onNext = useCallback(() => {
    if (onReview) {
      if (!createdEvent) {
        createMutation.mutate()
        return
      }
      goToStep(stepIndex + 1)
      return
    }
    if (stepKey === 'invite') {
      finish()
      return
    }
    goToStep(stepIndex + 1)
  }, [createMutation, createdEvent, finish, goToStep, onReview, stepIndex, stepKey])

  const onBack = useCallback(() => goToStep(stepIndex - 1), [goToStep, stepIndex])

  const validBasics = basicsValid(state)
  const validFormat = formatValid(state)
  const validCourse = courseValid(state)

  // Step descriptors -------------------------------------------------------
  const steps: WizardStepDescriptor[] = useMemo(() => {
    const desc = (idx: number, complete: boolean): WizardStepDescriptor['status'] =>
      idx === stepIndex ? 'current' : complete ? 'complete' : 'pending'
    const completeMap: Record<StepKey, boolean> = {
      basics: validBasics,
      format: validFormat,
      course: validCourse,
      verification: true,
      review: !!createdEvent,
      invite: false,
    }
    return visibleSteps.map((k, idx) => ({
      key: k,
      label: LABELS[k],
      status: desc(idx, completeMap[k]),
      reachable: idx <= stepIndex || (k === 'invite' ? !!createdEvent : true),
    }))
  }, [visibleSteps, stepIndex, validBasics, validFormat, validCourse, createdEvent])

  const nextLabel = (() => {
    if (stepKey === 'review') return createdEvent ? 'Continue' : createMutation.isPending ? 'Creating…' : 'Create event'
    if (stepKey === 'invite') return 'Done'
    return 'Continue'
  })()

  const nextDisabled =
    (stepKey === 'basics' && !validBasics) ||
    (stepKey === 'format' && !validFormat) ||
    (stepKey === 'course' && !validCourse) ||
    (stepKey === 'review' && !createdEvent && createMutation.isPending)

  function StepBody() {
    switch (stepKey) {
      case 'basics':
        return <BasicsStep state={state} onChange={setState} />
      case 'format':
        return <FormatStep state={state} onChange={setState} />
      case 'course':
        return <CourseStep state={state} onChange={setState} />
      case 'verification':
        return <VerificationStep state={state} onChange={setState} />
      case 'review':
        return <ReviewStep state={state} clubId={clubId} />
      case 'invite':
        if (!createdEvent) return null
        return <InviteStep slug={createdEvent.slug} hasClub={!!createdEvent.club_id} />
    }
  }

  return (
    <WizardShell
      steps={steps}
      currentIndex={stepIndex}
      onJump={(idx) => {
        if (steps[idx]?.reachable) goToStep(idx)
      }}
      onBack={stepIndex === 0 ? undefined : onBack}
      onNext={onNext}
      nextLabel={nextLabel}
      nextDisabled={!!nextDisabled}
      isLast={isLast}
      isSaving={createMutation.isPending}
      topBar={
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={smartBack}
            aria-label="Back"
            className="inline-flex items-center gap-1.5 t-section-title hover:text-secondary transition-colors"
          >
            <ChevronLeft size={16} /> Back
          </button>
          <h1 className="t-page-title hidden sm:block">
            {createdEvent ? 'Invite shooters' : 'New event'}
          </h1>
          <span className="w-16" />
        </div>
      }
    >
      <StepBody />
    </WizardShell>
  )
}
