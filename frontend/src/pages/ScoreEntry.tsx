export default function ScoreEntry() {
  return (
    <div className="p-4 space-y-6">
      <h1 className="text-2xl font-bold">New Score Card</h1>
      <p className="text-slate-400">
        25-shot entry coming soon. Log your card in under 60 seconds.
      </p>

      {/* Shot grid placeholder */}
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: 25 }, (_, i) => (
          <button
            key={i}
            className="aspect-square bg-slate-900 border border-slate-800 rounded-lg text-slate-600 font-mono text-sm"
          >
            {i + 1}
          </button>
        ))}
      </div>

      <div className="flex gap-3 text-slate-400 font-mono">
        <span>Total: <strong className="text-white">—</strong></span>
        <span>X: <strong className="text-brand-400">—</strong></span>
      </div>
    </div>
  )
}
