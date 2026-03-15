import { useState } from "react";
import { tickets } from "../data/tickets";
import { customers } from "../data/customers";
import { supportCategories } from "../data/roi";
import ROIBadge from "../components/ROIBadge";

export default function InternalTickets() {
  const [selectedId, setSelectedId] = useState(tickets[0].id);
  const [view, setView] = useState<"list" | "analytics">("list");

  const selected = tickets.find((t) => t.id === selectedId)!;
  const customer = customers.find((c) => c.id === selected.customer_id);

  const byChannel = tickets.reduce<Record<string, number>>((acc, t) => { acc[t.channel] = (acc[t.channel] || 0) + 1; return acc; }, {});
  const byCategory = tickets.reduce<Record<string, number>>((acc, t) => { acc[t.category] = (acc[t.category] || 0) + 1; return acc; }, {});
  const automationPct = tickets.filter((t) => t.automation_candidate).length / tickets.length;

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Internal Ticket System</h1>
          <p className="text-sm text-gray-500 mt-1">Structured ticket records with full analytics</p>
        </div>
        <div className="flex items-center gap-3">
          <ROIBadge lever="Data ownership" />
          <div className="flex bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
            <button onClick={() => setView("list")} className={`px-3 py-1.5 text-xs ${view === "list" ? "bg-blue-600 text-white" : "text-gray-400"}`}>Tickets</button>
            <button onClick={() => setView("analytics")} className={`px-3 py-1.5 text-xs ${view === "analytics" ? "bg-blue-600 text-white" : "text-gray-400"}`}>Analytics</button>
          </div>
        </div>
      </div>

      {view === "list" ? (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Ticket List */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-400">ALL TICKETS</h3>
              <span className="text-xs text-gray-500">{tickets.length} total</span>
            </div>
            <div className="divide-y divide-gray-800 max-h-[600px] overflow-y-auto">
              {tickets.map((t) => {
                const c = customers.find((cu) => cu.id === t.customer_id);
                return (
                  <button key={t.id} onClick={() => setSelectedId(t.id)}
                    className={`w-full text-left p-3 transition-colors ${t.id === selectedId ? "bg-blue-950/40" : "hover:bg-gray-800/50"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono text-gray-500">{t.id}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        t.status === "open" ? "bg-blue-900/50 text-blue-400" :
                        t.status === "escalated" ? "bg-red-900/50 text-red-400" :
                        t.status === "resolved" ? "bg-emerald-900/50 text-emerald-400" :
                        "bg-yellow-900/50 text-yellow-400"
                      }`}>{t.status}</span>
                    </div>
                    <div className="text-sm text-white truncate">{t.subject}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{c?.name} · {t.channel}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Ticket Detail */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">{selected.subject}</h3>
                <span className="text-xs font-mono text-gray-500">{selected.id}</span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {[
                  { label: "Customer", value: customer?.name || "" },
                  { label: "Channel", value: selected.channel },
                  { label: "Issue Type", value: selected.category.replace(/_/g, " ") },
                  { label: "Order", value: selected.order_id || "N/A" },
                  { label: "Product", value: selected.product_id || "N/A" },
                  { label: "Sentiment", value: selected.sentiment, color: selected.sentiment === "frustrated" ? "text-red-400" : selected.sentiment === "positive" ? "text-emerald-400" : "" },
                  { label: "Priority", value: selected.priority },
                  { label: "Automation", value: selected.automation_candidate ? "Candidate" : "Manual", color: selected.automation_candidate ? "text-emerald-400" : "" },
                ].map((field) => (
                  <div key={field.label}>
                    <div className="text-xs text-gray-500">{field.label}</div>
                    <div className={`text-sm capitalize ${(field as {color?: string}).color || "text-white"}`}>{field.value}</div>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Summary</div>
                  <div className="p-3 bg-gray-800/50 rounded-lg text-sm text-gray-300">{selected.summary}</div>
                </div>

                {selected.resolution && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Resolution</div>
                    <div className="p-3 bg-emerald-950/30 border border-emerald-900/40 rounded-lg text-sm text-gray-300">{selected.resolution}</div>
                  </div>
                )}

                <div className="flex items-center gap-4 pt-3 border-t border-gray-800">
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`w-2 h-2 rounded-full ${selected.gorgias_synced ? "bg-red-400" : "bg-gray-600"}`} />
                    <span className="text-gray-400">Gorgias: {selected.gorgias_synced ? "Synced" : "Not synced"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-2 h-2 rounded-full bg-blue-400" />
                    <span className="text-gray-400">Agent: {selected.agent}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-400">Created: {new Date(selected.created).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Analytics View */
        <div className="grid md:grid-cols-2 gap-6">
          {/* By Channel */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-400 mb-4">TICKETS BY CHANNEL</h3>
            <div className="space-y-3">
              {Object.entries(byChannel).sort((a, b) => b[1] - a[1]).map(([channel, count]) => (
                <div key={channel} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400 capitalize">{channel}</span>
                    <span className="text-white font-mono">{count}</span>
                  </div>
                  <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500/60 rounded-full" style={{ width: `${(count / tickets.length) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* By Category */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-400 mb-4">TOP ISSUE TYPES</h3>
            <div className="space-y-3">
              {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                <div key={cat} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">{cat.replace(/_/g, " ")}</span>
                    <span className="text-white font-mono">{count}</span>
                  </div>
                  <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500/60 rounded-full" style={{ width: `${(count / tickets.length) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Automation Potential */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-400 mb-4">AUTOMATION POTENTIAL</h3>
            <div className="text-center mb-4">
              <div className="text-4xl font-bold text-emerald-400">{(automationPct * 100).toFixed(0)}%</div>
              <div className="text-xs text-gray-500">of current tickets are automation candidates</div>
            </div>
            <div className="h-4 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500/60 rounded-full" style={{ width: `${automationPct * 100}%` }} />
            </div>
          </div>

          {/* Support Load by Product/Category */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-400 mb-4">SUPPORT CATEGORY MIX (PROJECTED)</h3>
            <div className="space-y-2">
              {supportCategories.map((cat) => (
                <div key={cat.name} className="flex items-center gap-3 text-xs">
                  <span className="w-32 text-gray-400 truncate">{cat.name}</span>
                  <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${cat.automatable ? "bg-emerald-500/60" : cat.deflectable ? "bg-blue-500/60" : "bg-gray-600"}`}
                      style={{ width: `${cat.pct * 100}%` }} />
                  </div>
                  <span className="w-10 text-right text-gray-500">{(cat.pct * 100).toFixed(0)}%</span>
                  <span className="w-16">
                    {cat.automatable && <span className="text-emerald-400 text-[10px]">auto</span>}
                    {cat.deflectable && <span className="text-blue-400 text-[10px] ml-1">deflect</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
