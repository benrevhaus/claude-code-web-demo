import { useDemo } from "../hooks/useDemo";
import { calcLegacyCost, calcNewSystemCost, calcSavings, formatCurrency, formatNumber, formatPct } from "../utils/roi";
import { MiniStat } from "../components/SimpleBar";
import ROIBadge from "../components/ROIBadge";

function Slider({ label, value, min, max, step, onChange, suffix = "" }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className="text-white font-mono">{value.toLocaleString()}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-blue-500" />
    </div>
  );
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-300 font-mono">{formatCurrency(value)}</span>
      </div>
      <div className="h-6 bg-gray-800 rounded overflow-hidden">
        <div className={`h-full rounded transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function CFODashboard() {
  const { state, setState } = useDemo();
  const p = state.roiParams;
  const setP = (key: string, val: number) =>
    setState((prev) => ({ ...prev, roiParams: { ...prev.roiParams, [key]: val } }));

  const legacy = calcLegacyCost(p);
  const newSys = calcNewSystemCost(p);
  const savings = calcSavings(legacy, newSys);
  const barMax = Math.max(legacy.total, newSys.total) * 1.1;

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">CFO Before / After Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Interactive financial simulation — adjust parameters to see impact</p>
        </div>
        <ROIBadge lever="Full financial picture" />
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Sliders */}
        <div className="space-y-5 bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Parameters</h3>
          <Slider label="Monthly Ticket Volume" value={p.ticketVolume} min={1000} max={30000} step={500} onChange={(v) => setP("ticketVolume", v)} />
          <Slider label="Cost Per Ticket" value={p.costPerTicket} min={1} max={15} step={0.1} onChange={(v) => setP("costPerTicket", v)} suffix="$" />
          <Slider label="AI Response %" value={p.aiResponsePct} min={0} max={90} step={5} onChange={(v) => setP("aiResponsePct", v)} suffix="%" />
          <Slider label="Phone Support %" value={p.phonePct} min={0} max={40} step={1} onChange={(v) => setP("phonePct", v)} suffix="%" />
          <Slider label="Agent Productivity Gain" value={p.agentProductivityGain} min={0} max={80} step={5} onChange={(v) => setP("agentProductivityGain", v)} suffix="%" />
          <Slider label="Automation Coverage" value={p.automationCoverage} min={0} max={80} step={5} onChange={(v) => setP("automationCoverage", v)} suffix="%" />
        </div>

        {/* Cost Comparison */}
        <div className="lg:col-span-2 space-y-6">
          {/* Big numbers */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MiniStat label="Monthly Legacy Cost" value={formatCurrency(legacy.total)} />
            <MiniStat label="Monthly New System" value={formatCurrency(newSys.total)} accent />
            <MiniStat label="Monthly Savings" value={formatCurrency(savings.monthlySaving)} sub={formatPct(savings.pctSaving) + " reduction"} accent />
            <MiniStat label="Annual Savings" value={formatCurrency(savings.annualSaving)} accent />
          </div>

          {/* Bar chart */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
            <h3 className="text-sm font-semibold text-gray-300">Cost Breakdown (Monthly)</h3>
            <div className="space-y-4">
              <div>
                <div className="text-xs text-red-400 font-semibold mb-2">LEGACY SYSTEM</div>
                <Bar label="Agent Salaries" value={legacy.agentCost} max={barMax} color="bg-red-500/70" />
                <Bar label="Ticket Processing" value={legacy.ticketCost} max={barMax} color="bg-red-400/70" />
                <Bar label="Platform Fees" value={legacy.platform} max={barMax} color="bg-red-300/70" />
              </div>
              <div className="border-t border-gray-800 pt-4">
                <div className="text-xs text-blue-400 font-semibold mb-2">AI-NATIVE SYSTEM</div>
                <Bar label="Agent Salaries (fewer)" value={newSys.agentCost} max={barMax} color="bg-blue-500/70" />
                <Bar label="Human Ticket Cost" value={newSys.ticketCost} max={barMax} color="bg-blue-400/70" />
                <Bar label="AI Processing" value={newSys.aiCost} max={barMax} color="bg-purple-400/70" />
                <Bar label="Platform (internal)" value={newSys.platformCost} max={barMax} color="bg-blue-300/70" />
              </div>
            </div>
          </div>

          {/* Efficiency stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MiniStat label="Tickets Deflected" value={formatNumber(newSys.deflectedTickets)} sub="per month" />
            <MiniStat label="AI-Handled" value={formatNumber(newSys.aiHandled)} sub="per month" />
            <MiniStat label="Human-Handled" value={formatNumber(newSys.humanHandled)} sub="per month" />
            <MiniStat label="Agents Needed" value={String(newSys.effectiveAgents)} sub={`down from ${p.agentSeats}`} />
          </div>

          {/* Vendor spend over time projection */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-gray-300 mb-4">12-Month Projection</h3>
            <div className="flex items-end gap-1 h-40">
              {Array.from({ length: 12 }, (_, i) => {
                const growth = 1 + (i * 0.01);
                const legacyH = (legacy.total * growth) / (legacy.total * 1.12) * 100;
                const newH = (newSys.total * (1 - i * 0.02)) / (legacy.total * 1.12) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col items-center gap-0.5" style={{ height: "140px" }}>
                      <div className="w-full flex items-end justify-center gap-px h-full">
                        <div className="w-[45%] bg-red-500/50 rounded-t transition-all" style={{ height: `${legacyH}%` }} />
                        <div className="w-[45%] bg-blue-500/50 rounded-t transition-all" style={{ height: `${Math.max(newH, 5)}%` }} />
                      </div>
                    </div>
                    <span className="text-[10px] text-gray-600">M{i + 1}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
              <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-red-500/50" />Legacy (growing)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-blue-500/50" />AI-Native (declining)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
