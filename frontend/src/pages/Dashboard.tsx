export default function Dashboard() {
  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-medium tracking-widest uppercase text-white/80">Dashboard</h1>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Best Score', value: '—' },
          { label: 'Best X Count', value: '—' },
          { label: 'Cards Logged', value: '0' },
          { label: 'League Position', value: '—' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4">
            <p className="text-[10px] tracking-widest uppercase text-white/30">{label}</p>
            <p className="text-2xl font-mono font-normal text-[#D4A44A] mt-1">{value}</p>
          </div>
        ))}
      </div>

      <p className="text-sm text-white/25 tracking-wide">Log your first card to start tracking.</p>
    </div>
  )
}
