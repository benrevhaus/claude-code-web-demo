import { useState } from "react";
import { formatCurrency } from "../utils/roi";
import ROIBadge from "../components/ROIBadge";

function Slider({ label, value, min, max, step, onChange, suffix = "" }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className="text-white font-mono">{value.toLocaleString()}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-red-500" />
    </div>
  );
}

export default function CostSimulator() {
  const [tickets, setTickets] = useState(8500);
  const [costPerTicket, setCostPerTicket] = useState(4.2);
  const [aiPct, setAiPct] = useState(25);
  const [seats, setSeats] = useState(12);
  const [baseFee, setBaseFee] = useState(900);

  // Legacy vendors charge per ticket including AI auto-replies
  const totalTickets = tickets;
  const aiTickets = Math.round(totalTickets * aiPct / 100);
  const humanTickets = totalTickets - aiTickets;

  const agentCost = seats * 4200;
  const gorgiasBaseCost = baseFee;
  const gorgiasPerTicket = totalTickets * 0.36; // ALL tickets, even AI
  const ticketProcessing = humanTickets * costPerTicket;
  const aiCost = aiTickets * 0.25; // AI replies also cost money
  const totalMonthly = agentCost + gorgiasBaseCost + gorgiasPerTicket + ticketProcessing + aiCost;
  const totalAnnual = totalMonthly * 12;

  // The trap: increasing AI % increases total cost because vendor still charges per-ticket
  const aiAt50 = Math.round(tickets * 0.5);
  const costAt50 = agentCost + baseFee + tickets * 0.36 + (tickets - aiAt50) * costPerTicket + aiAt50 * 0.25;
  const aiAt75 = Math.round(tickets * 0.75);
  const costAt75 = agentCost + baseFee + tickets * 0.36 + (tickets - aiAt75) * costPerTicket + aiAt75 * 0.25;

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Current State Cost Simulator</h1>
          <p className="text-sm text-gray-500 mt-1">See why legacy helpdesk pricing becomes expensive as you automate</p>
        </div>
        <ROIBadge lever="Vendor cost trap" />
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Controls */}
        <div className="space-y-5 bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-300">Adjust Parameters</h3>
          <Slider label="Monthly Ticket Volume" value={tickets} min={1000} max={30000} step={500} onChange={setTickets} />
          <Slider label="Cost Per Ticket (Human)" value={costPerTicket} min={1} max={15} step={0.1} onChange={setCostPerTicket} suffix="$" />
          <Slider label="AI Auto-Reply %" value={aiPct} min={0} max={80} step={5} onChange={setAiPct} suffix="%" />
          <Slider label="Agent Seats" value={seats} min={2} max={30} step={1} onChange={setSeats} />
          <Slider label="Platform Base Fee" value={baseFee} min={0} max={3000} step={100} onChange={setBaseFee} suffix="$" />

          <div className="border-t border-gray-800 pt-4">
            <div className="bg-red-950/30 border border-red-900/50 rounded-lg p-4">
              <div className="text-xs text-red-400 font-semibold mb-2">THE VENDOR TRAP</div>
              <p className="text-xs text-gray-400 leading-relaxed">
                Legacy helpdesks charge per-ticket fees on <strong className="text-red-300">all tickets</strong> — including AI auto-replies.
                As you increase automation, your per-ticket vendor fee doesn't decrease. You pay more to Gorgias even when AI handles the work.
              </p>
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="lg:col-span-2 space-y-6">
          {/* Cost Breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-500">Agent Salaries</div>
              <div className="text-xl font-bold text-white">{formatCurrency(agentCost)}</div>
              <div className="text-xs text-gray-600">{seats} seats x $4,200/mo</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-500">Gorgias Platform</div>
              <div className="text-xl font-bold text-white">{formatCurrency(gorgiasBaseCost + gorgiasPerTicket)}</div>
              <div className="text-xs text-gray-600">${baseFee} base + $0.36/ticket</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-500">Ticket Processing</div>
              <div className="text-xl font-bold text-white">{formatCurrency(ticketProcessing + aiCost)}</div>
              <div className="text-xs text-gray-600">{humanTickets.toLocaleString()} human + {aiTickets.toLocaleString()} AI</div>
            </div>
          </div>

          {/* Total */}
          <div className="bg-red-950/20 border border-red-900/50 rounded-xl p-6 text-center">
            <div className="text-sm text-red-400 mb-2">Total Monthly Cost</div>
            <div className="text-4xl font-bold text-white mb-1">{formatCurrency(totalMonthly)}</div>
            <div className="text-lg text-red-400">{formatCurrency(totalAnnual)} / year</div>
          </div>

          {/* The Trap Visualization */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-red-400 mb-4">Cost as AI % Increases (Same Ticket Volume)</h3>
            <div className="space-y-4">
              {[
                { label: `${aiPct}% AI (current)`, cost: totalMonthly, pct: aiPct },
                { label: "50% AI", cost: costAt50, pct: 50 },
                { label: "75% AI", cost: costAt75, pct: 75 },
              ].map((row) => (
                <div key={row.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">{row.label}</span>
                    <span className="text-white font-mono">{formatCurrency(row.cost)}</span>
                  </div>
                  <div className="h-8 bg-gray-800 rounded overflow-hidden relative">
                    <div className="h-full bg-red-500/40 rounded transition-all duration-500" style={{ width: `${(row.cost / (costAt75 * 1.1)) * 100}%` }} />
                    <div className="absolute inset-y-0 right-2 flex items-center text-[10px] text-gray-500">
                      vendor fee: {formatCurrency(baseFee + tickets * 0.36)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-4">
              Notice: even at 75% AI automation, total cost barely decreases because the platform fee is charged on ALL tickets.
              The vendor captures the efficiency gains.
            </p>
          </div>

          {/* Key insight */}
          <div className="bg-blue-950/30 border border-blue-800/50 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-blue-400 mb-2">The Solution</h3>
            <p className="text-sm text-gray-300 leading-relaxed">
              With an internal AI-native system, every ticket resolved by AI costs ~$0.15 instead of $4.20+.
              Zero platform fees. Zero per-ticket vendor charges.
              At {tickets.toLocaleString()} tickets/month with 65% AI handling, monthly cost drops to ~{formatCurrency(Math.round(tickets * 0.35 * costPerTicket * 0.5 + tickets * 0.65 * 0.15 + seats * 0.6 * 4200 + 180))}.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
