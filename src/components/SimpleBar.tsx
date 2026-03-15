export function SimpleBar({ label, value, max, color = "bg-blue-500", suffix = "" }: { label: string; value: number; max: number; color?: string; suffix?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-32 text-gray-400 truncate text-xs">{label}</span>
      <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-20 text-right text-xs text-gray-300 font-mono">{typeof value === "number" ? value.toLocaleString() : value}{suffix}</span>
    </div>
  );
}

export function MiniStat({ label, value, sub, accent = false }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-4 border ${accent ? "bg-blue-950/40 border-blue-800/50" : "bg-gray-900 border-gray-800"}`}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${accent ? "text-blue-400" : "text-white"}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}
