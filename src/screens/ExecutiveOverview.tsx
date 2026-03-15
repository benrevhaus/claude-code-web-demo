import { useNavigate } from "react-router-dom";
import { useDemo } from "../hooks/useDemo";
import ROIBadge from "../components/ROIBadge";

const stats = [
  { label: "Annual Helpdesk Spend", value: "$612K", sub: "Gorgias + agent costs", lever: "Vendor cost reduction" },
  { label: "Monthly Tickets", value: "8,500", sub: "Growing 12% QoQ", lever: "Ticket deflection" },
  { label: "Phone Inquiries", value: "15%", sub: "No ticket created", lever: "Data advantage" },
  { label: "Agent Count", value: "12", sub: "$50K avg loaded cost", lever: "Agent productivity" },
  { label: "Automation Potential", value: "65%", sub: "Currently 25%", lever: "Automation readiness" },
  { label: "Vendor Dependency", value: "100%", sub: "Single point of failure", lever: "Migration safety" },
];

const roadmap = [
  { phase: "Phase 1-2", label: "Copilot + Control Plane", status: "active" },
  { phase: "Phase 3-4", label: "Shadow Tickets + Phone", status: "upcoming" },
  { phase: "Phase 5-6", label: "Email + Firewall", status: "upcoming" },
  { phase: "Phase 7", label: "Legacy Retirement", status: "upcoming" },
];

export default function ExecutiveOverview() {
  const navigate = useNavigate();
  const { setState } = useDemo();

  const startWalkthrough = () => {
    setState((prev) => ({ ...prev, walkthroughActive: true, walkthroughStep: 0 }));
    navigate("/cost-simulator");
  };

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      {/* Hero */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-900/30 border border-blue-800/40 text-blue-400 text-xs font-semibold mb-4">
          Executive Strategy Demo
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 leading-tight">
          AI-Native Support Platform
        </h1>
        <p className="text-gray-400 max-w-2xl mx-auto text-lg">
          Replace your legacy helpdesk with an internal, AI-powered support operations platform.
          Cut costs 80%. Own your data. Ship faster.
        </p>
      </div>

      {/* Architecture Comparison */}
      <div className="grid md:grid-cols-2 gap-6 mb-12">
        <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-6">
          <h3 className="text-sm font-semibold text-red-400 mb-4">CURRENT STATE</h3>
          <div className="space-y-3 text-sm text-gray-400">
            <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-red-500" /> All channels route to Gorgias</div>
            <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-red-500" /> Per-ticket pricing punishes automation</div>
            <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-red-500" /> Phone calls = no ticket record</div>
            <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-red-500" /> Vendor owns your support data</div>
            <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-red-500" /> Limited AI integration</div>
            <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-red-500" /> $612K/year and growing</div>
          </div>
        </div>
        <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-6">
          <h3 className="text-sm font-semibold text-emerald-400 mb-4">FUTURE STATE</h3>
          <div className="space-y-3 text-sm text-gray-400">
            <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-emerald-500" /> AI-native support with MCP tools</div>
            <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Internal system = zero per-ticket fees</div>
            <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Phone-first ticketing captures all data</div>
            <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Complete data ownership</div>
            <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-emerald-500" /> 65% AI automation rate</div>
            <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-emerald-500" /> $122K/year — 80% reduction</div>
          </div>
        </div>
      </div>

      {/* Key Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-12">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <div className="text-xs text-gray-500 mb-1">{s.label}</div>
            <div className="text-2xl font-bold text-white mb-1">{s.value}</div>
            <div className="text-xs text-gray-500 mb-2">{s.sub}</div>
            <ROIBadge lever={s.lever} />
          </div>
        ))}
      </div>

      {/* Roadmap */}
      <div className="mb-12">
        <h2 className="text-xl font-bold text-white mb-6 text-center">Transformation Roadmap</h2>
        <div className="flex items-center gap-2 justify-center flex-wrap">
          {roadmap.map((r, i) => (
            <div key={r.phase} className="flex items-center gap-2">
              <div className={`px-4 py-3 rounded-lg border text-sm ${
                r.status === "active"
                  ? "bg-blue-900/30 border-blue-700 text-blue-300"
                  : "bg-gray-900 border-gray-800 text-gray-500"
              }`}>
                <div className="text-xs opacity-60">{r.phase}</div>
                <div className="font-medium">{r.label}</div>
              </div>
              {i < roadmap.length - 1 && <div className="w-8 h-px bg-gray-700" />}
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
        <button onClick={startWalkthrough} className="px-8 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-500 transition-colors text-sm">
          Start Founder Walkthrough
        </button>
        <button onClick={() => navigate("/war-room")} className="px-8 py-3 rounded-xl bg-purple-900/40 text-purple-300 border border-purple-800/50 font-semibold hover:bg-purple-900/60 transition-colors text-sm">
          CTO Deep Dive — War Room
        </button>
      </div>
    </div>
  );
}
