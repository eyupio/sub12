export default function Leagues() {
  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Leagues</h1>
        <button className="text-sm bg-brand-600 hover:bg-brand-500 text-white px-3 py-1.5 rounded-lg transition-colors">
          + Join
        </button>
      </div>
      <p className="text-slate-400">Public and private leagues will appear here.</p>
    </div>
  )
}
