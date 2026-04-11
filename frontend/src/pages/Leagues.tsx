export default function Leagues() {
  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-medium tracking-widest uppercase text-white/80">Leagues</h1>
        <button className="text-[11px] tracking-[0.15em] uppercase bg-[#D4A44A] hover:bg-[#E0B35A] text-[#0C0C0C] font-medium px-4 py-2 rounded transition-colors">
          Join
        </button>
      </div>
      <p className="text-sm text-white/25 tracking-wide">Public and private leagues will appear here.</p>
    </div>
  )
}
