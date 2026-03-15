import type { Slide } from '../../engine/types'

const slides: Slide[] = [

  // ─── 1. Hero ────────────────────────────────────────────────────────────────
  {
    type: 'hero',
    title: 'AI Support Firewall',
    subtitle: 'Cut Gorgias costs by 50–70% while making customer experience faster.',
    accent: 'CTO → Founder · March 2026',
    notes: 'Frame this as a strategic infrastructure shift, not just a cost cut. The firewall is an asset we own and compound over time.',
  },

  // ─── 2. Quote — the core paradox ────────────────────────────────────────────
  {
    type: 'quote',
    text: 'The more we automate support, the more Gorgias charges us.',
    attribution: 'The structural problem we need to fix',
    notes: 'Let this land before moving on. The paradox is the whole setup for the proposal.',
  },

  // ─── 3. Section — the problem ───────────────────────────────────────────────
  {
    type: 'section',
    title: 'The Current Problem',
    subtitle: 'How we got to six figures of annual spend — and why it only gets worse.',
    icon: '💸',
    notes: 'Transition into the problem framing. Keep tone diagnostic, not critical.',
  },

  // ─── 4. Bullet — Gorgias billing model ──────────────────────────────────────
  {
    type: 'bullet',
    title: 'How Gorgias Billing Works Against Us',
    subtitle: 'Every support interaction drives the invoice higher.',
    points: [
      'Every response inside Gorgias is a billable ticket event',
      'Cost = Platform Fee + Seats + Ticket Volume + AI Usage',
      'Higher order volume → more tickets → higher Gorgias costs',
      'More automation → more responses → even higher Gorgias costs',
      'Support automation, which should reduce costs, paradoxically increases them',
    ],
    notes: 'The billing model is structurally misaligned with our growth trajectory. Walk through each line slowly.',
  },

  // ─── 5. Proof Point — annual spend ──────────────────────────────────────────
  {
    type: 'proof-point',
    title: 'Current Annual Platform Spend',
    metric: '6 Figures',
    metricLabel: 'spent on Gorgias annually — and accelerating',
    narrative: 'This number scales directly with ticket volume. Every new customer, every new order, every automation we build drives this figure up. We are paying a tax on our own growth.',
    comparison: 'Grows faster than revenue as we scale',
    notes: 'This is the hook. The number should feel uncomfortable — because it is.',
  },

  // ─── 6. Section — the insight ───────────────────────────────────────────────
  {
    type: 'section',
    title: 'The Strategic Insight',
    subtitle: 'Separating ingestion from resolution changes the entire cost structure.',
    icon: '💡',
    notes: 'Shift the energy here — from problem to unlock.',
  },

  // ─── 7. Quote — the architectural key ───────────────────────────────────────
  {
    type: 'quote',
    text: 'Ticket ingestion and ticket resolution do not need to occur in the same system.',
    attribution: 'The architectural shift that unlocks cost savings',
    notes: 'This is the intellectual core of the proposal. Give it space.',
  },

  // ─── 8. Comparison — current vs firewall ────────────────────────────────────
  {
    type: 'comparison',
    title: 'Current Model vs. Firewall Model',
    left: {
      heading: 'Today: Gorgias-Centric',
      points: [
        'Every inquiry enters Gorgias immediately',
        'Every response is a billable ticket event',
        'AI answers still cost per-ticket',
        'More automation = higher cost',
        'Gorgias is the primary support system',
      ],
    },
    right: {
      heading: 'Firewall Model',
      points: [
        'Inquiries hit our internal system first',
        'AI resolves the majority at zero ticket cost',
        'Only complex cases escalate to Gorgias',
        'More automation = lower cost',
        'Gorgias becomes a human escalation layer',
      ],
    },
    notes: 'The right column is the goal state. The structural difference is where resolution happens.',
  },

  // ─── 9. Diagram — firewall architecture ─────────────────────────────────────
  {
    type: 'diagram',
    title: 'Support Firewall Architecture',
    layers: [
      {
        icon: '👤',
        label: 'Customers',
        description: 'Email · Website chat · Social DMs — all channels feed the same firewall',
        color: '#94a3b8',
      },
      {
        icon: '🛡️',
        label: 'Support Firewall (Internal AI System)',
        description: 'AI classifier · Knowledge base retrieval · Order lookup · Returns engine · Action executor · Response generator',
        color: '#f59e0b',
      },
      {
        icon: '⚡',
        label: 'Automated Resolution',
        description: '50–70% of tickets resolved instantly — no Gorgias, no agent, zero ticket cost',
        color: '#10b981',
      },
      {
        icon: '🎯',
        label: 'Human Escalation → Gorgias',
        description: 'Complex, sensitive, or edge-case inquiries only — agents focus on what requires real judgment',
        color: '#6366f1',
      },
    ],
    notes: 'Walk through each layer top to bottom. The amber layer is what we build. The green layer is the cost saving. The purple is the new, smaller role for Gorgias.',
  },

  // ─── 10. Bullet — WISMO example ─────────────────────────────────────────────
  {
    type: 'bullet',
    title: 'Example: Order Status Inquiry (WISMO)',
    subtitle: 'The single largest ticket category — handled entirely outside Gorgias.',
    points: [
      'Message arrives → Firewall ingests and classifies as WISMO',
      'Shopify API queried for order details',
      '3PL API queried for live shipment status',
      'AI generates a personalized response and sends it by email',
      'Customer gets an answer instantly — Gorgias is never involved',
      'Cost per ticket: $0',
    ],
    notes: 'This is a concrete, relatable example. WISMO is 30–40% of volume. If this is the only thing Phase 1 handles, it already changes the economics.',
  },

  // ─── 11. Section — business case ────────────────────────────────────────────
  {
    type: 'section',
    title: 'The Business Case',
    subtitle: 'What the numbers look like when automation finally reduces costs.',
    icon: '📊',
    notes: 'Transition into the quantitative case. These are conservative estimates.',
  },

  // ─── 12. Proof Point — automation coverage ──────────────────────────────────
  {
    type: 'proof-point',
    title: 'What We Can Automate',
    metric: '50–70%',
    metricLabel: 'of support volume resolvable on day one',
    narrative: 'WISMO (30–40%), returns (15–20%), address changes (5–10%), product questions (10–15%), and shipping issues (10%) are all automatable using existing data we already have access to.',
    comparison: 'Rising to 70–90% over time as self-serve tools mature',
    notes: 'Emphasize that this is based on real ecommerce distribution data, not optimistic projections.',
  },

  // ─── 13. Proof Point — annual savings ───────────────────────────────────────
  {
    type: 'proof-point',
    title: 'Annual Cost Reduction',
    metric: '$120K',
    metricLabel: 'saved annually at 60% automation rate',
    narrative: 'Baseline: 200,000 tickets at ~$1 average cost = $200K/year. At 60% automation, only 80,000 tickets reach Gorgias: $80K/year. The firewall pays back its build cost within months.',
    comparison: 'vs. $200K today — a 60% cost reduction',
    notes: 'These numbers are conservative and based on current ticket economics. The savings compound as volume grows.',
  },

  // ─── 14. Section — implementation ───────────────────────────────────────────
  {
    type: 'section',
    title: 'Phased Rollout',
    subtitle: 'Start narrow, prove ROI, expand systematically.',
    icon: '🗓️',
    notes: 'Frame phases as incremental bets, not a big-bang rewrite. Each phase stands alone and compounds.',
  },

  // ─── 15. Timeline — 4 phases ────────────────────────────────────────────────
  {
    type: 'timeline',
    title: 'Implementation Phases',
    items: [
      {
        icon: '📧',
        label: 'Phase 1 — Email Firewall',
        description: 'Ingest email, classify with AI, resolve WISMO and FAQ, escalate complex cases. Target: deflect ~25% of tickets within 4–6 weeks.',
      },
      {
        icon: '💬',
        label: 'Phase 2 — Website Chatbot',
        description: 'Replace or front-end the Gorgias chat widget with our own. Prevent tickets from being created at all.',
      },
      {
        icon: '🔧',
        label: 'Phase 3 — Self-Serve Portal',
        description: 'Returns, address changes, order modifications, subscription management. Each tool permanently eliminates a ticket category.',
      },
      {
        icon: '📡',
        label: 'Phase 4 — Channel Expansion',
        description: 'SMS, social messaging, any new channels. Full omnichannel coverage under the same firewall infrastructure.',
      },
    ],
    notes: 'Phase 1 is the proof of concept. If it deflects even 20% of tickets, the ROI case is closed and we accelerate.',
  },

  // ─── 16. Icon Card — strategic benefits ─────────────────────────────────────
  {
    type: 'icon-card',
    title: 'Strategic Benefits Beyond Cost',
    cards: [
      {
        icon: '⚡',
        label: 'Instant Responses',
        description: 'AI answers customers in seconds — no queue, no shift coverage, no SLA anxiety',
      },
      {
        icon: '📉',
        label: 'Ticket Elimination',
        description: 'Self-serve tools remove entire categories of tickets permanently, not just cheaper resolution',
      },
      {
        icon: '📊',
        label: 'Support Analytics',
        description: 'Structured insight into every customer problem — data we currently lose inside Gorgias',
      },
      {
        icon: '🔄',
        label: 'Product Feedback Loop',
        description: 'Support data feeds directly into product decisions, buying patterns, and operational improvement',
      },
    ],
    columns: 2,
    notes: 'The cost saving is the headline, but the strategic data ownership is the long-term value. We learn more about our customers than any off-the-shelf tool will ever give us.',
  },

  // ─── 17. Hero — CTA ─────────────────────────────────────────────────────────
  {
    type: 'hero',
    title: 'Next Step: Build Phase 1',
    subtitle: 'Email ingestion and AI resolution — running and measuring ticket deflection within 4–6 weeks.',
    accent: 'Low risk · High signal · Fast feedback',
    notes: 'End with a concrete ask. Phase 1 is a prototype — not a commitment to the whole architecture. We learn before we commit.',
  },

]

export default slides
