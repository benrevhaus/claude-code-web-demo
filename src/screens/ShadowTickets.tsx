import { useState } from "react";
import { shadowTickets } from "../data/shadowTickets";
import { tickets } from "../data/tickets";
import { customers } from "../data/customers";
import ROIBadge from "../components/ROIBadge";

const modes = [
  { id: "passive", label: "Passive Observation", desc: "Shadow system processes tickets silently. No agent impact. Building baseline accuracy data.", color: "bg-gray-500" },
  { id: "agent_assist", label: "Agent Assist", desc: "Shadow results shown to agents as suggestions. Agents choose whether to use them.", color: "bg-blue-500" },
  { id: "action_suggest", label: "Action Suggestion", desc: "System recommends specific actions with confidence scores. Agent approves with one click.", color: "bg-purple-500" },
  { id: "limited_autonomy", label: "Limited Autonomy", desc: "High-confidence tickets (>95%) handled automatically. Others go to agent review.", color: "bg-emerald-500" },
];

export default function ShadowTickets() {
  const [selectedShadow, setSelectedShadow] = useState(shadowTickets[0].id);
  const [activeMode, setActiveMode] = useState("agent_assist");

  const shadow = shadowTickets.find((s) => s.id === selectedShadow)!;
  const legacyTicket = tickets.find((t) => t.id === shadow.legacy_ticket_id);
  const customer = customers.find((c) => c.id === shadow.customer_id);

  const avgConfidence = shadowTickets.reduce((a, s) => a + s.confidence, 0) / shadowTickets.length;
  const avgTime = shadowTickets.reduce((a, s) => a + s.processing_time_ms, 0) / shadowTickets.length;
  const matchRate = shadowTickets.filter((s) => s.match_legacy).length / shadowTickets.length;

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Shadow Ticket System</h1>
          <p className="text-sm text-gray-500 mt-1">Parallel processing for safe migration — zero disruption</p>
        </div>
        <ROIBadge lever="Migration safety" />
      </div>

      {/* Mode Selector */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {modes.map((m) => (
          <button key={m.id} onClick={() => setActiveMode(m.id)}
            className={`p-4 rounded-xl border text-left transition-all ${activeMode === m.id ? "bg-gray-800 border-blue-700" : "bg-gray-900 border-gray-800 hover:border-gray-700"}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2.5 h-2.5 rounded-full ${m.color}`} />
              <span className="text-sm font-semibold text-white">{m.label}</span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">{m.desc}</p>
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-white">{(avgConfidence * 100).toFixed(1)}%</div>
          <div className="text-xs text-gray-500">Avg Confidence</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-white">{avgTime.toFixed(0)}ms</div>
          <div className="text-xs text-gray-500">Avg Processing Time</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-emerald-400">{(matchRate * 100).toFixed(0)}%</div>
          <div className="text-xs text-gray-500">Legacy Match Rate</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: Legacy Stream */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-red-400">LEGACY TICKET STREAM</h3>
            <span className="text-xs text-gray-500">Gorgias</span>
          </div>
          <div className="divide-y divide-gray-800">
            {shadowTickets.map((st) => {
              const lt = tickets.find((t) => t.id === st.legacy_ticket_id);
              const c = customers.find((cu) => cu.id === st.customer_id);
              return (
                <button key={st.id} onClick={() => setSelectedShadow(st.id)}
                  className={`w-full text-left p-4 transition-colors ${st.id === selectedShadow ? "bg-gray-800/50" : "hover:bg-gray-800/30"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono text-gray-500">{lt?.id}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      st.confidence >= 0.95 ? "bg-emerald-900/50 text-emerald-400" :
                      st.confidence >= 0.9 ? "bg-blue-900/50 text-blue-400" :
                      "bg-yellow-900/50 text-yellow-400"
                    }`}>{(st.confidence * 100).toFixed(0)}% conf</span>
                  </div>
                  <div className="text-sm text-white">{lt?.subject}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{c?.name} · {st.processing_time_ms}ms</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Shadow Analysis */}
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-yellow-400">SHADOW TICKET MIRROR</h3>
              <span className="text-xs font-mono text-gray-500">{shadow.id}</span>
            </div>

            {/* Classification */}
            <div className="mb-4">
              <div className="text-xs text-gray-500 mb-1">AI Classification</div>
              <span className="px-3 py-1 rounded-lg bg-blue-900/30 text-blue-400 text-sm font-medium">
                {shadow.classification.replace(/_/g, " ")}
              </span>
            </div>

            {/* Context Retrieved */}
            <div className="mb-4">
              <div className="text-xs text-gray-500 mb-2">Context Retrieved</div>
              <div className="space-y-1">
                {shadow.context_retrieved.map((ctx, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-emerald-400">&#10003;</span>
                    <span className="text-gray-300">{ctx}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Draft Response */}
            <div className="mb-4">
              <div className="text-xs text-gray-500 mb-2">Draft Response</div>
              <div className="p-3 bg-gray-800/50 rounded-lg text-sm text-gray-300 leading-relaxed">
                {shadow.draft_response}
              </div>
            </div>

            {/* Recommended Action */}
            <div className="mb-4">
              <div className="text-xs text-gray-500 mb-1">Recommended Action</div>
              <div className="text-sm text-purple-400 font-medium">{shadow.recommended_action}</div>
            </div>

            {/* Confidence Meter */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-500">Confidence Score</span>
                <span className="text-white font-mono">{(shadow.confidence * 100).toFixed(0)}%</span>
              </div>
              <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${
                  shadow.confidence >= 0.95 ? "bg-emerald-500" :
                  shadow.confidence >= 0.9 ? "bg-blue-500" :
                  "bg-yellow-500"
                }`} style={{ width: `${shadow.confidence * 100}%` }} />
              </div>
            </div>
          </div>

          {/* Mode behavior */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="text-xs text-gray-500 mb-2">Current Mode Behavior</div>
            <div className="text-sm text-gray-300">
              {activeMode === "passive" && "This ticket was silently processed. No agent saw the shadow result. Data is being collected for accuracy benchmarking."}
              {activeMode === "agent_assist" && `Agent sees the draft response and recommended action as a suggestion. Confidence: ${(shadow.confidence * 100).toFixed(0)}%. Agent decides whether to use it.`}
              {activeMode === "action_suggest" && `System recommends: "${shadow.recommended_action}" with ${(shadow.confidence * 100).toFixed(0)}% confidence. Agent can approve with one click.`}
              {activeMode === "limited_autonomy" && (shadow.confidence >= 0.95
                ? "This ticket would be handled AUTOMATICALLY — confidence exceeds 95% threshold. Agent notified but no action needed."
                : `Confidence ${(shadow.confidence * 100).toFixed(0)}% is below 95% threshold. Routed to agent for review.`)}
            </div>
          </div>

          {/* Legacy comparison */}
          {legacyTicket && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-xs text-gray-500 mb-2">Legacy Comparison</div>
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-2 h-2 rounded-full ${shadow.match_legacy ? "bg-emerald-500" : "bg-red-500"}`} />
                <span className="text-sm text-gray-300">
                  {shadow.match_legacy ? "Shadow output matches legacy resolution" : "Shadow output differs from legacy resolution"}
                </span>
              </div>
              <div className="text-xs text-gray-500">Legacy status: {legacyTicket.status} · Agent: {legacyTicket.agent}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
