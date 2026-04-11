export default function Dashboard() {
  return (
    <div className="p-4 space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-slate-400">Your stats and recent activity will appear here.</p>

      {/* Placeholder stat cards */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Best Score', value: '—' },
          { label: 'Best X Count', value: '—' },
          { label: 'Cards Logged', value: '0' },
          { label: 'League Position', value: '—' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider">{label}</p>
            <p className="text-2xl font-mono font-bold mt-1">{value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
