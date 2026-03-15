// All slide definitions for the CTO Vision deck
export const slides = [
  // 0 — Title
  {
    id: 'title',
    layout: 'title',
    kicker: 'Strategic Memo · March 2026',
    title: 'Building an AI-Native Operational Advantage',
    subtitle: 'From CTO to Founder — A blueprint for transforming our company into an AI-augmented commerce operating system.',
  },

  // 1 — Executive Summary
  {
    id: 'exec-summary',
    layout: 'content',
    kicker: 'Executive Summary',
    title: 'We Have Scale. Now We Need Leverage.',
    body: 'We are a <strong>high eight-figure wellness e-commerce brand</strong> with ~1,000 active SKUs, strong repeat purchase behavior, and consistent YoY growth. But EBITDA margins remain constrained by costs that scale linearly with revenue.',
    metrics: [
      { label: 'Active SKUs', value: '~1,000', color: 'accent' },
      { label: 'Key Strength', value: 'High LTV', color: 'green' },
      { label: 'Challenge', value: 'Margin Pressure', color: 'amber' },
      { label: 'Opportunity', value: 'AI Leverage', color: 'accent' },
    ],
  },

  // 2 — The Problem
  {
    id: 'five-constraints',
    layout: 'content',
    kicker: 'The Problem',
    title: 'Five Structural Cost Drivers',
    body: 'Each of these grows roughly in proportion to revenue — creating a ceiling on profitability without intervention.',
    bullets: [
      { text: '<strong>Customer Support</strong> — Ticket volume scales linearly with orders', color: 'red' },
      { text: '<strong>Marketing Spend</strong> — High CAC pressure from rising ad costs & creative fatigue', color: 'amber' },
      { text: '<strong>Fulfillment</strong> — SKU complexity drives pick/pack and shipping inefficiency', color: 'amber' },
      { text: '<strong>Inventory</strong> — 1,000 SKUs tie up working capital with reactive forecasting', color: 'amber' },
      { text: '<strong>Team Bandwidth</strong> — Small team stretched thin, limited AI literacy embedded', color: 'red' },
    ],
  },

  // 3 — Support Scaling
  {
    id: 'support-scaling',
    layout: 'content',
    kicker: 'Constraint Deep Dive',
    title: 'The Support Scaling Problem',
    chain: [
      { label: 'Growth', sub: 'revenue up' },
      { label: 'More Orders', sub: 'volume rises' },
      { label: 'More Tickets', sub: 'linear scaling' },
      { label: 'More Headcount', sub: 'cost drag' },
    ],
    body: 'Support volume is <strong>transaction-driven</strong>. Without intervention, it becomes a structural drag on margins as we grow.',
    tags: ['Order Status', 'Shipping Delays', 'Returns', 'Product Education', 'Subscriptions', 'Troubleshooting'],
  },

  // 4 — Marketing Pressure
  {
    id: 'marketing-pressure',
    layout: 'two-col',
    kicker: 'Constraint Deep Dive',
    title: 'Marketing Efficiency Under Pressure',
    leftContent: {
      heading: 'Current Channels',
      bullets: ['Paid Social', 'Influencer Networks', 'Affiliate Programs', 'Retargeting', 'Email / SMS'],
    },
    rightContent: {
      heading: 'What We Need',
      bullets: ['Better funnel optimization', 'Faster landing page iteration', 'Stronger first-party data utilization', 'Identification of underexploited segments'],
      color: 'green',
    },
  },

  // 5 — Strategic Asset
  {
    id: 'strategic-asset',
    layout: 'section',
    title: 'Our Hidden Strategic Asset',
    subtitle: 'Nearly a decade of structured KPI data with hundreds of pre-cached columns across operations, marketing, product performance, and customer behavior.',
  },

  // 6 — AI-Native Opportunity
  {
    id: 'ai-opportunity',
    layout: 'content',
    kicker: 'Strategic Opportunity',
    title: 'AI-Native Operations',
    body: 'Modern AI allows us to build an <strong>operational intelligence layer</strong> across the entire company, integrating three key domains.',
    pillars: [
      { icon: '🧠', title: 'Knowledge Intelligence', desc: 'Institutional knowledge and decision history — searchable, synthesized, always available.' },
      { icon: '📊', title: 'Data Intelligence', desc: 'Operational metrics and analytics — queryable in natural language, surfacing insights automatically.' },
      { icon: '⚡', title: 'Capability Intelligence', desc: 'Continuous absorption of external technology — codebases analyzed, patterns extracted, integrations scaffolded.' },
    ],
  },

  // 7 — Priority 1: Support Deflection
  {
    id: 'priority-support',
    layout: 'content',
    kicker: 'Strategic Priority 1',
    title: 'Customer Support Deflection',
    priority: 'high',
    priorityLabel: 'Highest EBITDA Impact',
    body: 'Build an AI support layer handling a large percentage of customer interactions automatically — plus a self-serve portal for direct customer action.',
    insights: [
      { icon: '💬', color: 'blue', title: 'AI Resolution', desc: 'Order status, shipping, returns, refunds, product education, reordering, subscriptions' },
      { icon: '🖥️', color: 'purple', title: 'Self-Service Portal', desc: 'Modify orders, update addresses, initiate returns, track shipments, manage subscriptions' },
      { icon: '📉', color: 'green', title: 'Decoupled Costs', desc: 'Support costs no longer grow linearly with revenue — headcount stabilizes' },
      { icon: '⚡', color: 'amber', title: 'Faster Resolution', desc: 'Instant responses improve customer experience while reducing operational burden' },
    ],
  },

  // 8 — Priority 2: KPI Intelligence
  {
    id: 'priority-kpi',
    layout: 'content',
    kicker: 'Strategic Priority 2',
    title: 'AI-Powered KPI Intelligence',
    priority: 'high',
    priorityLabel: 'Decision Leverage',
    body: 'Turn our decade of structured data into an always-available strategic advisor. Ask questions in plain English — get answers in seconds.',
    queries: [
      '"Which SKUs have highest repeat purchase but low marketing spend?"',
      '"Which products generate the most support tickets per order?"',
      '"Which customer cohorts generate the highest lifetime value?"',
      '"Which landing pages historically convert best for new customers?"',
    ],
  },

  // 9 — Priority 3: Inventory Intelligence
  {
    id: 'priority-inventory',
    layout: 'two-col',
    kicker: 'Strategic Priority 3',
    title: 'Inventory Intelligence',
    priority: 'medium',
    priorityLabel: 'Capital Efficiency',
    leftContent: {
      heading: 'Demand Prediction',
      bullets: ['SKU-level demand forecasting', 'Seasonal spike detection', 'Optimal reorder timing', 'Stockout risk alerts'],
      color: 'blue',
    },
    rightContent: {
      heading: 'SKU Performance',
      bullets: ['Slow-moving inventory flags', 'High-margin retention winners', 'Discontinuation candidates', 'Smart bundling opportunities'],
      color: 'green',
    },
    bottomHighlight: 'Better forecasting → less excess inventory → less trapped capital → improved gross margin',
  },

  // 10 — Priority 4: Funnel Velocity
  {
    id: 'priority-funnel',
    layout: 'content',
    kicker: 'Strategic Priority 4',
    title: 'Funnel & Landing Page Velocity',
    priority: 'medium',
    priorityLabel: 'Marketing Multiplier',
    body: 'Today, creating landing pages requires design, copy, development, and testing. AI compresses this into a rapid iteration engine.',
    insights: [
      { icon: '🎯', color: 'purple', title: 'Input', desc: 'Product + target audience + channel + historical conversion data' },
      { icon: '🚀', color: 'blue', title: 'Output', desc: 'Optimized landing pages, copy variations, conversion hypotheses, creative recommendations' },
      { icon: '🔄', color: 'green', title: 'Result', desc: 'Dramatically increased experimentation speed — more tests, faster learnings, better CAC' },
    ],
  },

  // 11 — Priority 5: Tribal Knowledge
  {
    id: 'priority-knowledge',
    layout: 'content',
    kicker: 'Strategic Priority 5',
    title: 'Tribal Knowledge System',
    priority: 'strategic',
    priorityLabel: 'Institutional Memory',
    body: 'Our company knowledge is scattered across Slack, docs, SOPs, experiments, and people\'s heads. AI can index, synthesize, and make it instantly accessible.',
    queries: [
      '"Why did we discontinue product X?"',
      '"What strategy did we use for influencer campaigns in 2022?"',
      '"How do we usually resolve shipping disputes?"',
    ],
    bottomHighlight: 'Reduces internal friction, accelerates onboarding, preserves institutional memory as the team grows.',
  },

  // 12 — Priority 6: Capability Absorption
  {
    id: 'priority-capability',
    layout: 'content',
    kicker: 'Strategic Priority 6',
    title: 'Capability Absorption Engine',
    priority: 'strategic',
    priorityLabel: 'Continuous Learning',
    body: 'Using AI development tools, we can systematically monitor, analyze, and absorb capabilities from the open-source ecosystem.',
    insights: [
      { icon: '👁️', color: 'cyan', title: 'Monitor', desc: 'Track relevant open-source repos and emerging tools automatically' },
      { icon: '🔍', color: 'blue', title: 'Analyze', desc: 'AI reads codebases, summarizes architecture, identifies reusable patterns' },
      { icon: '🧩', color: 'purple', title: 'Extract', desc: 'Generate integration scaffolding and adaptation strategies' },
      { icon: '🚀', color: 'green', title: 'Accelerate', desc: 'Technical roadmap velocity increases without proportional engineering headcount' },
    ],
  },

  // 13 — Organizational Principles
  {
    id: 'org-principles',
    layout: 'content',
    kicker: 'Implementation',
    title: 'Organizational Principles',
    body: 'Success depends on <strong>embedding AI into infrastructure</strong> — not relying on individual expertise.',
    checklist: [
      'AI integrated into existing workflows, not bolted on',
      'Tools accessible through simple, natural interfaces',
      'Teams benefit from AI without needing deep technical knowledge',
      'Infrastructure-level embedding, not hero-dependent',
    ],
  },

  // 14 — Strategic Outcome
  {
    id: 'outcome',
    layout: 'content',
    kicker: 'Strategic Outcome',
    title: 'Revenue Growth Without Proportional Cost Growth',
    body: 'The compound effect of these six priorities directly improves EBITDA while maintaining our growth trajectory.',
    checklist: [
      'Customer support costs stabilize as revenue grows',
      'Marketing efficiency improves — better CAC, more experiments',
      'Inventory capital requirements decrease',
      'Team productivity multiplied through AI augmentation',
      'Experimentation velocity accelerates across all functions',
    ],
    highlight: 'We become an AI-augmented commerce operating system.',
  },

  // 15 — Closing
  {
    id: 'closing',
    layout: 'section',
    title: 'A Durable Operational Advantage',
    subtitle: 'Few companies possess the combination of strong retention, large SKU depth, long historical data, and operational maturity. This is not incremental optimization — it is the creation of a compounding advantage.',
  },
];
