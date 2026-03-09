import type { Slide } from '../../engine/types'

const slides: Slide[] = [
  // ── 1. Opener ───────────────────────────────────────────────────────────────
  {
    type: 'hero',
    title: 'Building an AI-Native Organization',
    subtitle: 'The Garden Model for Scaling Value',
    notes: 'Opening. Let the title breathe. This is a reframe — not "AI as a tool" but AI as an operating environment.',
  },

  // ── 2. Executive Summary ────────────────────────────────────────────────────
  {
    type: 'bullet',
    title: 'Executive Summary',
    points: [
      'AI is about to change how organizations create and preserve knowledge — not just how they write code',
      'If we encode our systems as knowledge-rich "seeds", every feature becomes a permanent building block',
      'Both humans and AI can understand and extend these seeds',
      'This allows the company to scale the value of every person, not headcount',
    ],
    notes: 'Founder-facing summary. Emphasize the distinction: most companies see AI as a productivity tool. This is a structural redesign.',
  },

  // ── 3. Section: Founder Memo ────────────────────────────────────────────────
  {
    type: 'section',
    title: 'Founder Memo',
    subtitle: 'The deeper opportunity most companies will miss.',
    icon: '📝',
    notes: 'Transition into the detailed argument.',
  },

  // ── 4. The Opportunity ──────────────────────────────────────────────────────
  {
    type: 'bullet',
    title: 'The Opportunity',
    subtitle: 'AI is becoming capable enough to fundamentally change how organizations operate.',
    points: [
      'Most companies will adopt AI as a productivity tool — this is the shallow play',
      'The deeper opportunity: redesign how the company captures knowledge, builds systems, and distributes capability',
      'Instead of AI sitting on top of the org, embed AI into the operating environment itself',
    ],
    notes: 'The key contrast is "AI as tool" vs. "AI as operating environment." Pause on the third bullet — this is the thesis.',
  },

  // ── 5. The Key Idea ─────────────────────────────────────────────────────────
  {
    type: 'icon-card',
    title: 'The Key Idea: Knowledge-Encoded Seeds',
    cards: [
      { icon: '💻', label: 'Implementation', description: 'The working code — what the system does' },
      { icon: '📖', label: 'Explanation', description: 'Documentation — how it works' },
      { icon: '🎯', label: 'Reasoning', description: 'Intent — why it was built this way' },
      { icon: '🗺️', label: 'Architecture', description: 'Structure — how it fits in the larger system' },
      { icon: '📚', label: 'Context', description: 'History — what was tried, what failed' },
      { icon: '🧠', label: 'Lessons Learned', description: 'Hard-won knowledge encoded permanently' },
    ],
    columns: 3,
    notes: 'Walk through each card. The key insight: every feature becomes a self-contained knowledge artifact. Not just code — context.',
  },

  // ── 6. Why Seeds Compound ───────────────────────────────────────────────────
  {
    type: 'quote',
    text: 'An organizational memory that compounds instead of disappearing.',
    notes: 'Let this land. Most orgs have the opposite — memory that disappears. Seeds flip the model.',
  },

  // ── 7. Why This Matters ─────────────────────────────────────────────────────
  {
    type: 'bullet',
    title: 'Why This Matters',
    subtitle: 'Today, most companies constantly lose knowledge.',
    points: [
      'It lives in people\'s heads, Slack threads, and undocumented systems',
      'Each time someone changes roles or leaves, context is lost and must be rediscovered',
      'Knowledge-encoded seeds solve this: instead of losing knowledge, the company accumulates it permanently',
    ],
    notes: 'Relatable pain. Ask: how many times have you rebuilt something that someone already figured out? Seeds prevent that loop.',
  },

  // ── 8. The Strategic Advantage ──────────────────────────────────────────────
  {
    type: 'bullet',
    title: 'The Strategic Advantage',
    subtitle: 'Competitors can copy features. They cannot easily copy years of encoded organizational knowledge.',
    points: [
      'Onboarding becomes faster — new hires inherit context immediately',
      'Iteration cycles become faster — less rediscovery, more building',
      'AI agents become dramatically more useful — they have rich context to work with',
      'Systems become self-explanatory — anyone can understand and extend them',
    ],
    notes: 'This is the moat argument. Features are commodities. Encoded organizational intelligence is not.',
  },

  // ── 9. Section: The Garden Model ────────────────────────────────────────────
  {
    type: 'section',
    title: 'The Garden Model',
    subtitle: 'Think of the company as a garden ecosystem.',
    icon: '🌿',
    notes: 'Transition into the metaphor. The garden is a mental model, not a metaphor for decoration — it maps precisely to org structure.',
  },

  // ── 10. Garden Overview ─────────────────────────────────────────────────────
  {
    type: 'bullet',
    title: 'What Healthy Gardens Require',
    subtitle: 'Organizations work the same way.',
    points: [
      'Good soil — the culture and environment that enables growth',
      'Careful planting — deliberate decisions about what to build',
      'Irrigation systems — tools and processes that ensure consistent delivery',
      'Pollination — spreading value to customers and the market',
      'Pruning — removing waste and complexity intentionally',
      'Resilience to storms — the ability to withstand disruption',
    ],
    notes: 'Use this as a map for what follows. Each element becomes a section of the model.',
  },

  // ── 11. Roles: Gardeners ────────────────────────────────────────────────────
  {
    type: 'icon-card',
    title: 'Roles in the Garden',
    cards: [
      {
        icon: '🌱',
        label: 'Gardeners',
        description: 'Product & Leadership — decide what should grow. What problems to solve, where to invest, what ideas to cultivate.',
      },
      {
        icon: '🔨',
        label: 'Workers',
        description: 'Engineering, Design, Operations — cultivate the garden. Build systems, ship features, maintain infrastructure.',
      },
      {
        icon: '📦',
        label: 'Suppliers',
        description: 'Vendors & Platforms — provide tools and materials. SaaS platforms, infrastructure providers, data vendors, integrations.',
      },
      {
        icon: '🦋',
        label: 'Pollinators',
        description: 'Marketing & Growth — spread the value produced by the garden. Without pollination, even great products do not grow.',
      },
      {
        icon: '🌍',
        label: 'Soil',
        description: 'Culture — documentation, knowledge sharing, experimentation, trust, learning. Great ideas cannot grow in poor soil.',
      },
    ],
    columns: 3,
    notes: 'Walk through each role. The Soil card is important — it\'s the foundation. Bad culture = bad soil = nothing grows well.',
  },

  // ── 12. Irrigation Systems ──────────────────────────────────────────────────
  {
    type: 'bullet',
    title: 'Irrigation Systems',
    subtitle: 'Healthy gardens do not depend on rain.',
    points: [
      'Rain = luck, market timing, external opportunity — unpredictable and unreliable',
      'Irrigation = tools, workflows, automation, knowledge systems, internal infrastructure',
      'Irrigation systems ensure consistent growth regardless of external conditions',
      'Balance matters: too much irrigation → bureaucracy. Too little → chaos.',
    ],
    notes: 'The irrigation metaphor is the argument against "we\'ll figure it out when we need it." You build the pipes before drought.',
  },

  // ── 13. Storms ──────────────────────────────────────────────────────────────
  {
    type: 'bullet',
    title: 'Storms Are Unavoidable',
    subtitle: 'Organizations cannot stop storms. But they can build resilience.',
    points: [
      'Economic uncertainty',
      'Global events',
      'Technology disruption',
      'Supply chain changes',
    ],
    notes: 'Keep this brief. The point isn\'t to catalog threats — it\'s that resilience is designed, not hoped for.',
  },

  // ── 14. Section: Where AI Fits ──────────────────────────────────────────────
  {
    type: 'section',
    title: 'Where AI Fits in the Garden',
    subtitle: 'AI becomes an intelligent layer across the entire ecosystem.',
    icon: '🤖',
    notes: 'Pivot to AI. Not a standalone tool — an embedded layer.',
  },

  // ── 15. AI Roles ────────────────────────────────────────────────────────────
  {
    type: 'icon-card',
    title: 'AI as an Intelligent Layer',
    cards: [
      {
        icon: '🌿',
        label: 'AI Assistant Gardeners',
        description: 'Analyze product usage, surface opportunities, simulate scenarios, evaluate trade-offs. Compresses research cycles from weeks to hours.',
      },
      {
        icon: '🔨',
        label: 'AI Assistant Workers',
        description: 'Generate code, create internal tools, run tests, write documentation, refactor systems. Engineers focus on architecture, judgment, and creativity.',
      },
      {
        icon: '🔬',
        label: 'AI Soil Inspectors',
        description: 'Monitor org health by detecting workflow bottlenecks, knowledge gaps, fragile systems, and adoption problems.',
      },
    ],
    columns: 3,
    notes: 'Each AI role mirrors a human role in the garden. This isn\'t replacement — it\'s augmentation at every layer.',
  },

  // ── 16. Democratizing Creation ──────────────────────────────────────────────
  {
    type: 'bullet',
    title: 'Democratizing Creation',
    subtitle: 'AI enables a new model for how features get built.',
    points: [
      'Traditional path: Idea → Spec → Engineering → Testing → Documentation → Deployment (weeks or months)',
      'New model: anyone in the org can express ideas, prototype tools, generate systems, and document reasoning',
      'Creation becomes distributed across the entire organization',
    ],
    notes: 'This is the "10x leverage" argument. The bottleneck shifts from engineering capacity to idea quality.',
  },

  // ── 17. Document the Ecosystem ──────────────────────────────────────────────
  {
    type: 'bullet',
    title: 'Documenting the Technology Ecosystem',
    subtitle: 'For this system to work, we must document every layer of the org\'s technology.',
    points: [
      'Internal tools, SaaS platforms, vendor systems, integrations, automation pipelines',
      'Each system records: purpose, ownership, cost, usage, integrations, adoption',
      'Result: a queryable map of the organization',
    ],
    notes: 'This sounds operational but it\'s strategic. You can\'t prune what you can\'t see.',
  },

  // ── 18. Querying the Ecosystem ──────────────────────────────────────────────
  {
    type: 'bullet',
    title: 'Querying the Ecosystem',
    subtitle: 'The organization becomes self-observable.',
    points: [
      'Do we already have a tool for this?',
      'Which tools overlap?',
      'Where are we overspending?',
      'Which systems are underused?',
      'What should be pruned?',
    ],
    notes: 'Frame this as the difference between flying blind and having instruments. You want the instruments.',
  },

  // ── 19. Pruning ─────────────────────────────────────────────────────────────
  {
    type: 'bullet',
    title: 'Pruning the Garden',
    subtitle: 'Healthy gardens require intentional removal, not just growth.',
    points: [
      'Without pruning: tool sprawl, cost increases, complexity compounds',
      'Documented ecosystems allow retirement of unused tools and consolidation of systems',
      'AI can assist by monitoring ecosystem health continuously',
    ],
    notes: 'Pruning is often undervalued. Teams celebrate adding. Pruning is equally important discipline.',
  },

  // ── 20. Scaling Value ───────────────────────────────────────────────────────
  {
    type: 'bullet',
    title: 'Scaling Value Without Scaling Headcount',
    subtitle: 'Traditional scaling vs. AI-enabled scaling.',
    points: [
      'Traditional: more products → more engineers. More customers → more support. More systems → more operators.',
      'This leads to coordination overhead, slower decisions, and increasing complexity',
      'AI model: each employee gains AI assistants, researchers, builders, and analysts',
      'The organization becomes a hybrid workforce of humans and AI',
    ],
    notes: 'This is the core economic argument. Linear headcount scaling is a liability model. This is a leverage model.',
  },

  // ── 21. Maximize Leverage ───────────────────────────────────────────────────
  {
    type: 'quote',
    text: 'The key question changes from "How many people do we need?" to "How much value can each person create?"',
    notes: 'Close on this. It\'s a fundamental reframe of how the org thinks about hiring, growth, and performance.',
  },
]

export default slides
