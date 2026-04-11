export default function ScoreEntry() {
  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-medium tracking-widest uppercase text-white/80">New Score Card</h1>

      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: 25 }, (_, i) => (
          <button
            key={i}
            className="aspect-square bg-white/[0.03] border border-white/[0.06] rounded text-white/20 font-mono text-xs hover:border-[#D4A44A]/30 hover:text-white/60 transition-colors"
          >
            {i + 1}
          </button>
        ))}
      </div>

      <div className="flex gap-6 font-mono text-sm">
        <span className="text-white/30 tracking-widest uppercase text-[11px]">
          Total <strong className="text-white ml-2">—</strong>
        </span>
        <span className="text-white/30 tracking-widest uppercase text-[11px]">
          X <strong className="text-[#D4A44A] ml-2">—</strong>
        </span>
      </div>
    </div>
  )
}
