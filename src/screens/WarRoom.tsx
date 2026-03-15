import { useState, useEffect, useRef, useCallback } from "react";
import { useDemo } from "../hooks/useDemo";
import ROIBadge from "../components/ROIBadge";
import { formatCurrency } from "../utils/roi";

interface SimTicket {
  id: number;
  subject: string;
  category: string;
  channel: string;
  system: "legacy" | "ai_native";
  status: "incoming" | "classifying" | "processing" | "resolved" | "escalated";
  resolvedBy: "ai" | "agent" | "escalated" | null;
  time: number;
}

const ticketTemplates = [
  { subject: "Where is my order?", category: "WISMO", channel: "chat" },
  { subject: "Return request", category: "Return", channel: "email" },
  { subject: "Shipping delay inquiry", category: "Shipping", channel: "email" },
  { subject: "Product sizing question", category: "Product", channel: "chat" },
  { subject: "Address change needed", category: "Account", channel: "chat" },
  { subject: "Damaged item received", category: "Damaged", channel: "email" },
  { subject: "Order status check", category: "WISMO", channel: "chat" },
  { subject: "Cancel my order", category: "Cancel", channel: "email" },
  { subject: "Refund not received", category: "Billing", channel: "email" },
  { subject: "Product recommendation", category: "Product", channel: "chat" },
  { subject: "Track my package", category: "WISMO", channel: "chat" },
  { subject: "Exchange for different size", category: "Return", channel: "phone" },
  { subject: "Warranty claim", category: "Damaged", channel: "email" },
  { subject: "Update payment method", category: "Account", channel: "chat" },
  { subject: "Bulk order inquiry", category: "Sales", channel: "email" },
];

const autoCategories = new Set(["WISMO", "Account", "Cancel"]);

export default function WarRoom() {
  const { state, setState } = useDemo();
  const [running, setRunning] = useState(false);
  const [simTickets, setSimTickets] = useState<SimTicket[]>([]);
  const [counters, setCounters] = useState({ aiResolved: 0, agentHandled: 0, escalated: 0, gorgiasAvoided: 0, minutesSaved: 0, costAvoided: 0 });
  const ticketIdRef = useRef(1);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const toggles = state.toggles;
  const setToggle = (key: keyof typeof toggles) =>
    setState((prev) => ({ ...prev, toggles: { ...prev.toggles, [key]: !prev.toggles[key] } }));

  const processTicket = useCallback((ticket: SimTicket): SimTicket => {
    const isAutomatable = autoCategories.has(ticket.category);

    if (toggles.supportFirewall && isAutomatable && Math.random() > 0.2) {
      return { ...ticket, status: "resolved", resolvedBy: "ai", system: "ai_native" };
    }
    if (toggles.automation && isAutomatable && Math.random() > 0.3) {
      return { ...ticket, status: "resolved", resolvedBy: "ai", system: "ai_native" };
    }
    if (toggles.mcpCopilot && Math.random() > 0.4) {
      return { ...ticket, status: "resolved", resolvedBy: "agent", system: "ai_native" };
    }
    if (ticket.category === "Billing" || ticket.category === "Damaged" || ticket.category === "Sales") {
      return { ...ticket, status: "escalated", resolvedBy: "escalated", system: toggles.shadowMode ? "ai_native" : "legacy" };
    }
    return { ...ticket, status: "resolved", resolvedBy: "agent", system: toggles.phoneFirst || toggles.shadowMode ? "ai_native" : "legacy" };
  }, [toggles]);

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      const template = ticketTemplates[Math.floor(Math.random() * ticketTemplates.length)];
      const newTicket: SimTicket = {
        id: ticketIdRef.current++,
        ...template,
        system: "legacy",
        status: "incoming",
        resolvedBy: null,
        time: Date.now(),
      };

      setSimTickets((prev) => {
        const processed = processTicket(newTicket);
        const updated = [processed, ...prev].slice(0, 50);

        setCounters((c) => ({
          aiResolved: c.aiResolved + (processed.resolvedBy === "ai" ? 1 : 0),
          agentHandled: c.agentHandled + (processed.resolvedBy === "agent" ? 1 : 0),
          escalated: c.escalated + (processed.resolvedBy === "escalated" ? 1 : 0),
          gorgiasAvoided: c.gorgiasAvoided + (processed.system === "ai_native" ? 1 : 0),
          minutesSaved: c.minutesSaved + (processed.resolvedBy === "ai" ? 8.5 : toggles.mcpCopilot ? 4.3 : 0),
          costAvoided: c.costAvoided + (processed.system === "ai_native" ? 4.56 : 0),
        }));

        return updated;
      });
    }, 800);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, processTicket, toggles]);

  const legacyTickets = simTickets.filter((t) => t.system === "legacy");
  const aiTickets = simTickets.filter((t) => t.system === "ai_native");

  const resetSim = () => {
    setRunning(false);
    setSimTickets([]);
    setCounters({ aiResolved: 0, agentHandled: 0, escalated: 0, gorgiasAvoided: 0, minutesSaved: 0, costAvoided: 0 });
    ticketIdRef.current = 1;
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Support War Room</h1>
          <p className="text-sm text-gray-500 mt-1">Live simulation — toggle features and watch the impact</p>
        </div>
        <div className="flex items-center gap-3">
          <ROIBadge lever="Full system demonstration" />
          <button onClick={resetSim} className="px-3 py-1.5 text-xs bg-gray-800 text-gray-400 rounded-lg hover:bg-gray-700">Reset</button>
          <button onClick={() => setRunning(!running)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${running ? "bg-red-600 text-white hover:bg-red-500" : "bg-emerald-600 text-white hover:bg-emerald-500 animate-pulse"}`}>
            {running ? "Stop Simulation" : "Start Simulation"}
          </button>
        </div>
      </div>

      {/* Toggle Controls */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {([
          { key: "mcpCopilot" as const, label: "MCP Copilot", desc: "AI tools for agents" },
          { key: "phoneFirst" as const, label: "Phone-First", desc: "Internal ticketing" },
          { key: "shadowMode" as const, label: "Shadow Mode", desc: "Parallel processing" },
          { key: "supportFirewall" as const, label: "Support Firewall", desc: "Pre-processing layer" },
          { key: "automation" as const, label: "Automation", desc: "Auto-resolve tickets" },
        ]).map((t) => (
          <button key={t.key} onClick={() => setToggle(t.key)}
            className={`p-3 rounded-xl border transition-all text-left ${toggles[t.key] ? "bg-blue-950/40 border-blue-700" : "bg-gray-900 border-gray-800"}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-white">{t.label}</span>
              <div className={`w-8 h-4 rounded-full transition-colors flex items-center ${toggles[t.key] ? "bg-blue-600 justify-end" : "bg-gray-700 justify-start"}`}>
                <div className="w-3 h-3 rounded-full bg-white mx-0.5" />
              </div>
            </div>
            <div className="text-[10px] text-gray-500">{t.desc}</div>
          </button>
        ))}
      </div>

      {/* Live Counters */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
        {[
          { label: "AI Resolved", value: counters.aiResolved, color: "text-emerald-400" },
          { label: "Agent Handled", value: counters.agentHandled, color: "text-blue-400" },
          { label: "Escalated", value: counters.escalated, color: "text-yellow-400" },
          { label: "Gorgias Avoided", value: counters.gorgiasAvoided, color: "text-purple-400" },
          { label: "Minutes Saved", value: Math.round(counters.minutesSaved), color: "text-cyan-400" },
          { label: "Cost Avoided", value: formatCurrency(counters.costAvoided), color: "text-emerald-400" },
        ].map((c) => (
          <div key={c.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
            <div className={`text-xl font-bold font-mono ${c.color} transition-all`}>{typeof c.value === "number" ? c.value.toLocaleString() : c.value}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Two Stream View */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Legacy Queue */}
        <div className="bg-gray-900 border border-red-900/40 rounded-xl overflow-hidden">
          <div className="p-3 border-b border-gray-800 flex items-center justify-between bg-red-950/20">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <h3 className="text-sm font-semibold text-red-400">Legacy System Queue</h3>
            </div>
            <span className="text-xs text-gray-500">{legacyTickets.length} tickets</span>
          </div>
          <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-800/50">
            {legacyTickets.length === 0 ? (
              <div className="p-8 text-center text-gray-600 text-sm">
                {running ? "Tickets being deflected from legacy system..." : "Start simulation to see tickets flow"}
              </div>
            ) : (
              legacyTickets.map((t) => (
                <div key={t.id} className="p-3 flex items-center gap-3 animate-[fadeIn_0.3s_ease-in]">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    t.status === "resolved" ? "bg-gray-500" : t.status === "escalated" ? "bg-red-500" : "bg-yellow-500"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-white truncate">{t.subject}</div>
                    <div className="text-[10px] text-gray-500">{t.channel} · {t.category}</div>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    t.resolvedBy === "agent" ? "bg-blue-900/50 text-blue-400" :
                    t.resolvedBy === "escalated" ? "bg-red-900/50 text-red-400" :
                    "bg-gray-800 text-gray-500"
                  }`}>{t.resolvedBy || t.status}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* AI-Native Queue */}
        <div className="bg-gray-900 border border-blue-900/40 rounded-xl overflow-hidden">
          <div className="p-3 border-b border-gray-800 flex items-center justify-between bg-blue-950/20">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <h3 className="text-sm font-semibold text-blue-400">AI-Native System Queue</h3>
            </div>
            <span className="text-xs text-gray-500">{aiTickets.length} tickets</span>
          </div>
          <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-800/50">
            {aiTickets.length === 0 ? (
              <div className="p-8 text-center text-gray-600 text-sm">
                {running ? "Enable toggles to route tickets here..." : "Start simulation to see tickets flow"}
              </div>
            ) : (
              aiTickets.map((t) => (
                <div key={t.id} className="p-3 flex items-center gap-3 animate-[fadeIn_0.3s_ease-in]">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    t.resolvedBy === "ai" ? "bg-emerald-500" : t.resolvedBy === "agent" ? "bg-blue-500" : "bg-yellow-500"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-white truncate">{t.subject}</div>
                    <div className="text-[10px] text-gray-500">{t.channel} · {t.category}</div>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    t.resolvedBy === "ai" ? "bg-emerald-900/50 text-emerald-400" :
                    t.resolvedBy === "agent" ? "bg-blue-900/50 text-blue-400" :
                    "bg-yellow-900/50 text-yellow-400"
                  }`}>{t.resolvedBy === "ai" ? "AI resolved" : t.resolvedBy || t.status}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Insight */}
      <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-400 mb-2">TOGGLE IMPACT GUIDE</h3>
        <div className="grid sm:grid-cols-5 gap-4 text-xs text-gray-400">
          <div><strong className="text-white">MCP Copilot:</strong> Agents resolve tickets faster. More tickets handled per hour.</div>
          <div><strong className="text-white">Phone-First:</strong> Phone tickets enter internal system. Reduces Gorgias dependency.</div>
          <div><strong className="text-white">Shadow Mode:</strong> All tickets processed by both systems. Builds migration confidence.</div>
          <div><strong className="text-white">Support Firewall:</strong> Common queries resolved before reaching any helpdesk. Maximum deflection.</div>
          <div><strong className="text-white">Automation:</strong> High-confidence tickets auto-resolved by AI. Lowest cost per ticket.</div>
        </div>
      </div>
    </div>
  );
}
