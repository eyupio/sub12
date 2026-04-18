import { Link } from '@tanstack/react-router'
import { Target } from 'lucide-react'
import { useSmartBack } from '../hooks/useSmartBack'

export default function NotFound() {
  const smartBack = useSmartBack('/')
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <Target size={48} className="mx-auto text-[var(--brass)] mb-4" />
        <h1 className="text-2xl font-semibold tracking-wide text-secondary">
          Target not found
        </h1>
        <p className="mt-2 text-sm text-muted">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            to="/"
            className="px-4 py-2 rounded-lg bg-[var(--brass)]/10 text-[var(--brass)] text-sm tracking-wide hover:bg-[var(--brass)]/20 transition-colors"
          >
            Go home
          </Link>
          <button
            onClick={smartBack}
            className="px-4 py-2 rounded-lg text-secondary text-sm tracking-wide hover:bg-surface-hover transition-colors"
          >
            Go back
          </button>
        </div>
      </div>
    </div>
  )
}
