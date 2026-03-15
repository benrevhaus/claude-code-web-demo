import { useState } from "react";
import { tickets } from "../data/tickets";
import { customers } from "../data/customers";
import { orders } from "../data/orders";
import { shipments } from "../data/shipments";
import { simulateAIResponse } from "../utils/aiSim";
import ROIBadge from "../components/ROIBadge";

export default function AgentControlPlane() {
  const [selectedTicketId, setSelectedTicketId] = useState(tickets[0].id);
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const [showLegacy, setShowLegacy] = useState(false);

  const ticket = tickets.find((t) => t.id === selectedTicketId)!;
  const customer = customers.find((c) => c.id === ticket.customer_id);
  const custOrders = orders.filter((o) => o.customer_id === ticket.customer_id);
  const order = ticket.order_id ? orders.find((o) => o.id === ticket.order_id) : null;
  const shipment = order ? shipments.find((s) => s.order_id === order.id) : null;

  const handleChat = () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatInput("");
    const response = simulateAIResponse(userMsg, ticket.customer_id, ticket.order_id || undefined);
    setChatHistory((prev) => [...prev, { role: "user", text: userMsg }, { role: "ai", text: response }]);
  };

  const quickPrompts = [
    "Where is this order?",
    "Summarize this customer's history",
    "Is this return eligible?",
    "Draft response for delayed shipment",
  ];

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Agent Entry Control Plane</h1>
          <p className="text-sm text-gray-500 mt-1">Unified agent interface with AI copilot and MCP tools</p>
        </div>
        <div className="flex items-center gap-3">
          <ROIBadge lever="Agent productivity +40%" />
          <button onClick={() => setShowLegacy(!showLegacy)} className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${showLegacy ? "bg-red-900/30 border-red-800 text-red-400" : "bg-gray-800 border-gray-700 text-gray-400"}`}>
            {showLegacy ? "Close Legacy Portal" : "Open Legacy Portal"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4" style={{ minHeight: "calc(100vh - 180px)" }}>
        {/* Ticket Queue */}
        <div className="col-span-12 lg:col-span-3 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="p-3 border-b border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400">TICKET QUEUE</h3>
          </div>
          <div className="divide-y divide-gray-800 max-h-[600px] overflow-y-auto">
            {tickets.filter((t) => t.status !== "resolved").map((t) => {
              const c = customers.find((cu) => cu.id === t.customer_id);
              return (
                <button key={t.id} onClick={() => { setSelectedTicketId(t.id); setChatHistory([]); }}
                  className={`w-full text-left p-3 transition-colors ${t.id === selectedTicketId ? "bg-blue-950/40" : "hover:bg-gray-800/50"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono text-gray-500">{t.id}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      t.priority === "urgent" ? "bg-red-900/50 text-red-400" :
                      t.priority === "high" ? "bg-orange-900/50 text-orange-400" :
                      "bg-gray-800 text-gray-500"
                    }`}>{t.priority}</span>
                  </div>
                  <div className="text-sm text-white truncate">{t.subject}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{c?.name} · {t.channel}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Content */}
        <div className="col-span-12 lg:col-span-5 space-y-4">
          {/* Customer Summary */}
          {customer && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-gray-400">CUSTOMER SUMMARY</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                  customer.tier === "VIP" ? "bg-purple-900/40 text-purple-400" :
                  customer.tier === "Premium" ? "bg-blue-900/40 text-blue-400" :
                  "bg-gray-800 text-gray-400"
                }`}>{customer.tier}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500 text-xs">Name</span><div className="text-white">{customer.name}</div></div>
                <div><span className="text-gray-500 text-xs">Lifetime Value</span><div className="text-white">${customer.lifetime_value.toLocaleString()}</div></div>
                <div><span className="text-gray-500 text-xs">Orders</span><div className="text-white">{customer.orders_count}</div></div>
                <div><span className="text-gray-500 text-xs">Sentiment</span><div className={`${customer.sentiment === "frustrated" ? "text-red-400" : customer.sentiment === "positive" ? "text-emerald-400" : "text-gray-300"}`}>{customer.sentiment}</div></div>
              </div>
            </div>
          )}

          {/* Ticket Detail */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-gray-400 mb-3">TICKET DETAIL</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Subject</span><span className="text-white">{ticket.subject}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Channel</span><span className="text-white capitalize">{ticket.channel}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Category</span><span className="text-white">{ticket.category.replace(/_/g, " ")}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Automation</span><span className={ticket.automation_candidate ? "text-emerald-400" : "text-gray-500"}>{ticket.automation_candidate ? "Candidate" : "Manual"}</span></div>
            </div>
            <div className="mt-3 p-3 bg-gray-800/50 rounded-lg text-sm text-gray-300">{ticket.summary}</div>
            {ticket.ai_draft && (
              <div className="mt-3 p-3 bg-blue-950/30 border border-blue-900/50 rounded-lg">
                <div className="text-xs text-blue-400 font-semibold mb-1">AI SUGGESTED RESPONSE</div>
                <div className="text-sm text-gray-300 whitespace-pre-line">{ticket.ai_draft}</div>
              </div>
            )}
          </div>

          {/* Order & Shipment Cards */}
          {order && (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-gray-400 mb-2">ORDER LOOKUP</h3>
                <div className="text-sm space-y-1">
                  <div className="text-white font-mono">{order.id}</div>
                  <div className="text-gray-400">${order.total} · {order.status}</div>
                  <div className="text-gray-500 text-xs">{order.date}</div>
                </div>
              </div>
              {shipment && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-gray-400 mb-2">SHIPMENT TRACKING</h3>
                  <div className="text-sm space-y-1">
                    <div className={`font-medium ${shipment.status === "delayed" ? "text-red-400" : shipment.status === "delivered" ? "text-emerald-400" : "text-blue-400"}`}>{shipment.status}</div>
                    <div className="text-gray-400 text-xs">{shipment.location}</div>
                    <div className="text-gray-500 text-xs">ETA: {shipment.estimated_delivery}</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* AI Copilot Chat */}
        <div className="col-span-12 lg:col-span-4 bg-gray-900 border border-gray-800 rounded-xl flex flex-col overflow-hidden">
          <div className="p-3 border-b border-gray-800 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-400">AI COPILOT (MCP)</h3>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>

          {/* Quick prompts */}
          <div className="p-3 border-b border-gray-800 flex flex-wrap gap-1.5">
            {quickPrompts.map((qp) => (
              <button key={qp} onClick={() => { setChatInput(qp); }}
                className="text-[11px] px-2.5 py-1 rounded-md bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors">{qp}</button>
            ))}
          </div>

          {/* Chat history */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px] max-h-[400px]">
            {chatHistory.length === 0 && (
              <div className="text-center py-8 text-gray-600 text-sm">Ask the AI copilot about this ticket...</div>
            )}
            {chatHistory.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === "user" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300"
                }`}>
                  <div className="whitespace-pre-line">{msg.text}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gray-800 flex gap-2">
            <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleChat()}
              placeholder="Ask AI copilot..." className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:ring-1 focus:ring-blue-500" />
            <button onClick={handleChat} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-500">Send</button>
          </div>
        </div>
      </div>

      {/* Legacy Portal Overlay */}
      {showLegacy && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-8" onClick={() => setShowLegacy(false)}>
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-red-500 flex items-center justify-center text-white text-xs font-bold">G</div>
                  <span className="font-semibold text-gray-900">Gorgias Legacy Portal</span>
                </div>
                <button onClick={() => setShowLegacy(false)} className="text-gray-400 hover:text-gray-600">Close</button>
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr><th className="text-left p-3 text-gray-600">Ticket</th><th className="text-left p-3 text-gray-600">Subject</th><th className="text-left p-3 text-gray-600">Status</th><th className="text-left p-3 text-gray-600">Customer</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tickets.filter((t) => t.gorgias_synced).map((t) => {
                      const c = customers.find((cu) => cu.id === t.customer_id);
                      return (
                        <tr key={t.id} className="hover:bg-gray-50">
                          <td className="p-3 font-mono text-gray-500">{t.id}</td>
                          <td className="p-3 text-gray-900">{t.subject}</td>
                          <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs ${t.status === "open" ? "bg-yellow-100 text-yellow-700" : t.status === "escalated" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>{t.status}</span></td>
                          <td className="p-3 text-gray-600">{c?.name}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 p-3 bg-red-50 rounded-lg text-xs text-red-600">
                This is what agents currently see. Limited context, no AI tools, no customer 360 view. Each ticket costs $0.36 in platform fees regardless of how it's resolved.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
