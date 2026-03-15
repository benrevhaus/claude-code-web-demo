import { useState } from "react";
import { phoneCalls } from "../data/phoneCalls";
import { customers } from "../data/customers";
import { orders } from "../data/orders";
import { useDemo } from "../hooks/useDemo";
import ROIBadge from "../components/ROIBadge";

export default function PhoneSupport() {
  const { state, setState } = useDemo();
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [callNotes, setCallNotes] = useState("");
  const [callPhase, setCallPhase] = useState<"incoming" | "identify" | "lookup" | "notes" | "summary" | "ticket">("incoming");
  const [generatedSummary, setGeneratedSummary] = useState("");
  const [ticketCreated, setTicketCreated] = useState(false);
  const [syncedToGorgias, setSyncedToGorgias] = useState(false);

  const incomingCall = phoneCalls.find((c) => c.status === "incoming");
  const completedCalls = phoneCalls.filter((c) => c.status === "completed");

  const startCall = () => {
    if (!incomingCall) return;
    setActiveCallId(incomingCall.id);
    setCallPhase("identify");
    setCallNotes("");
    setGeneratedSummary("");
    setTicketCreated(false);
    setSyncedToGorgias(false);
  };

  const customer = incomingCall ? customers.find((c) => c.id === incomingCall.customer_id) : null;
  const custOrders = customer ? orders.filter((o) => o.customer_id === customer.id) : [];

  const advancePhase = () => {
    const phases: typeof callPhase[] = ["incoming", "identify", "lookup", "notes", "summary", "ticket"];
    const idx = phases.indexOf(callPhase);
    if (callPhase === "notes") {
      setGeneratedSummary(
        `VIP customer ${customer?.name} called regarding recent orders. ${callNotes || "General inquiry."}. Customer sentiment: positive. Recommended follow-up: check order status in 2 days.`
      );
      setCallPhase("summary");
    } else if (callPhase === "summary") {
      setTicketCreated(true);
      setCallPhase("ticket");
      setState((prev) => ({
        ...prev,
        phoneCallsHandled: [...prev.phoneCallsHandled, incomingCall!.id],
        internalTickets: [...prev.internalTickets, `TKT-P-${Date.now()}`],
      }));
    } else if (idx < phases.length - 1) {
      setCallPhase(phases[idx + 1]);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Phone Support Workflow</h1>
          <p className="text-sm text-gray-500 mt-1">Phone calls become internal system-of-record tickets</p>
        </div>
        <ROIBadge lever="Data advantage — 15% volume" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Incoming Call */}
        <div className="space-y-4">
          {/* Incoming */}
          {!activeCallId && incomingCall && (
            <div className="bg-gray-900 border border-emerald-800/50 rounded-xl p-6 animate-pulse">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-emerald-600/20 flex items-center justify-center">
                  <span className="text-emerald-400 text-lg">&#9742;</span>
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">Incoming Call</div>
                  <div className="text-xs text-gray-400">{incomingCall.phone}</div>
                </div>
              </div>
              <button onClick={startCall} className="w-full py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500">
                Accept Call
              </button>
            </div>
          )}

          {/* Call Flow */}
          {activeCallId && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-emerald-400 font-semibold">CALL ACTIVE</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>

              {/* Phase Steps */}
              <div className="space-y-2">
                {[
                  { id: "identify", label: "1. Identify Customer", desc: "System matched caller ID to customer record" },
                  { id: "lookup", label: "2. Retrieve Orders", desc: "Pulling recent orders and account info" },
                  { id: "notes", label: "3. Log Call Notes", desc: "Agent enters notes during the call" },
                  { id: "summary", label: "4. AI Summary", desc: "AI generates structured call summary" },
                  { id: "ticket", label: "5. Create Ticket", desc: "Internal ticket created from call" },
                ].map((step) => {
                  const phases: string[] = ["incoming", "identify", "lookup", "notes", "summary", "ticket"];
                  const stepIdx = phases.indexOf(step.id);
                  const currentIdx = phases.indexOf(callPhase);
                  const isDone = currentIdx > stepIdx;
                  const isCurrent = callPhase === step.id;
                  return (
                    <div key={step.id} className={`p-3 rounded-lg border text-sm ${
                      isCurrent ? "bg-blue-950/40 border-blue-800" :
                      isDone ? "bg-gray-800/50 border-gray-700" :
                      "bg-gray-900 border-gray-800 opacity-40"
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${isDone ? "bg-emerald-600 text-white" : isCurrent ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-500"}`}>
                          {isDone ? "✓" : step.id[0].toUpperCase()}
                        </span>
                        <span className={isDone ? "text-gray-400" : isCurrent ? "text-white" : "text-gray-600"}>{step.label}</span>
                      </div>
                      {isCurrent && <p className="text-xs text-gray-500 mt-1 ml-7">{step.desc}</p>}
                    </div>
                  );
                })}
              </div>

              {callPhase === "notes" && (
                <textarea value={callNotes} onChange={(e) => setCallNotes(e.target.value)}
                  placeholder="Enter call notes..."
                  className="w-full h-24 bg-gray-800 rounded-lg p-3 text-sm text-white placeholder-gray-600 outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
              )}

              {callPhase !== "ticket" && (
                <button onClick={advancePhase} className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500">
                  {callPhase === "notes" ? "Generate AI Summary" : callPhase === "summary" ? "Create Internal Ticket" : "Next Step"}
                </button>
              )}
            </div>
          )}

          {/* Completed Calls */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-gray-400 mb-3">COMPLETED CALLS</h3>
            <div className="space-y-2">
              {completedCalls.map((call) => (
                <div key={call.id} className="p-3 bg-gray-800/50 rounded-lg text-sm">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">{call.caller_name}</span>
                    <span className="text-gray-500">{Math.floor(call.duration_sec / 60)}m {call.duration_sec % 60}s</span>
                  </div>
                  <div className="text-gray-300 text-xs">{call.category.replace(/_/g, " ")}</div>
                  {call.ticket_created && <span className="text-[10px] text-emerald-400 mt-1 inline-block">Ticket: {call.ticket_id}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Customer Context */}
        <div className="space-y-4">
          {customer && callPhase !== "incoming" && (
            <>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-gray-400 mb-3">CUSTOMER IDENTIFIED</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Name</span><span className="text-white">{customer.name}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Tier</span><span className="text-purple-400">{customer.tier}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">LTV</span><span className="text-white">${customer.lifetime_value.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Orders</span><span className="text-white">{customer.orders_count}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Email</span><span className="text-gray-300">{customer.email}</span></div>
                </div>
              </div>

              {(callPhase === "lookup" || callPhase === "notes" || callPhase === "summary" || callPhase === "ticket") && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-gray-400 mb-3">RECENT ORDERS</h3>
                  <div className="space-y-2">
                    {custOrders.map((o) => (
                      <div key={o.id} className="p-2 bg-gray-800/50 rounded text-sm flex justify-between">
                        <div>
                          <div className="text-white font-mono text-xs">{o.id}</div>
                          <div className="text-gray-500 text-xs">{o.date}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-white text-xs">${o.total}</div>
                          <div className={`text-xs ${o.status === "delivered" ? "text-emerald-400" : o.status === "delayed" ? "text-red-400" : "text-blue-400"}`}>{o.status}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* AI Summary & Ticket */}
        <div className="space-y-4">
          {generatedSummary && (
            <div className="bg-blue-950/30 border border-blue-800/50 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-blue-400 mb-2">AI CALL SUMMARY</h3>
              <p className="text-sm text-gray-300 leading-relaxed">{generatedSummary}</p>
            </div>
          )}

          {ticketCreated && (
            <>
              <div className="bg-emerald-950/30 border border-emerald-800/50 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-emerald-400 mb-2">INTERNAL TICKET CREATED</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Ticket ID</span><span className="text-white font-mono">TKT-P-NEW</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Customer</span><span className="text-white">{customer?.name}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Channel</span><span className="text-white">Phone</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">System of Record</span><span className="text-emerald-400">Internal</span></div>
                </div>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-gray-400 mb-3">GORGIAS SYNC</h3>
                <p className="text-xs text-gray-500 mb-3">Optionally sync this ticket to Gorgias for legacy tracking.</p>
                <button
                  onClick={() => setSyncedToGorgias(true)}
                  disabled={syncedToGorgias}
                  className={`w-full py-2 rounded-lg text-sm font-medium ${syncedToGorgias ? "bg-gray-800 text-gray-500" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
                >
                  {syncedToGorgias ? "Synced to Gorgias Archive" : "Sync to Gorgias"}
                </button>
                {syncedToGorgias && <p className="text-xs text-yellow-500 mt-2">This is optional. The internal system is the primary record.</p>}
              </div>
            </>
          )}

          {/* Key Insight */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-amber-400 mb-2">WHY THIS MATTERS</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Phone calls are 15% of support volume but create zero tickets in Gorgias.
              By creating tickets internally first, we capture data that was previously lost.
              The internal system becomes the system of record — Gorgias sync is optional.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
