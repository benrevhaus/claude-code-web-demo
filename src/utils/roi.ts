export function calcLegacyCost(params: {
  ticketVolume: number;
  costPerTicket: number;
  agentSeats: number;
  platformBaseFee: number;
}) {
  const agentCost = params.agentSeats * 4200;
  const ticketCost = params.ticketVolume * params.costPerTicket;
  const platform = params.platformBaseFee + params.ticketVolume * 0.36;
  return { agentCost, ticketCost, platform, total: agentCost + ticketCost + platform };
}

export function calcNewSystemCost(params: {
  ticketVolume: number;
  costPerTicket: number;
  aiResponsePct: number;
  agentProductivityGain: number;
  automationCoverage: number;
  agentSeats: number;
  platformBaseFee: number;
}) {
  const deflectedTickets = params.ticketVolume * (params.automationCoverage / 100);
  const remainingTickets = params.ticketVolume - deflectedTickets;
  const aiHandled = remainingTickets * (params.aiResponsePct / 100);
  const humanHandled = remainingTickets - aiHandled;
  const effectiveAgents = Math.ceil(params.agentSeats / (1 + params.agentProductivityGain / 100));
  const agentCost = effectiveAgents * 4200;
  const ticketCost = humanHandled * params.costPerTicket * 0.5;
  const aiCost = aiHandled * 0.15;
  const platformCost = params.platformBaseFee * 0.2;
  return {
    agentCost,
    ticketCost,
    aiCost,
    platformCost,
    total: agentCost + ticketCost + aiCost + platformCost,
    deflectedTickets: Math.round(deflectedTickets),
    aiHandled: Math.round(aiHandled),
    humanHandled: Math.round(humanHandled),
    effectiveAgents,
  };
}

export function calcSavings(legacy: { total: number }, newSys: { total: number }) {
  const monthlySaving = legacy.total - newSys.total;
  const annualSaving = monthlySaving * 12;
  const pctSaving = legacy.total > 0 ? (monthlySaving / legacy.total) * 100 : 0;
  return { monthlySaving, annualSaving, pctSaving };
}

export function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

export function formatPct(n: number) {
  return `${Math.round(n)}%`;
}
