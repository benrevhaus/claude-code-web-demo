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

  // ── 22. Why Most Won't Do This ──────────────────────────────────────────────
  {
    type: 'bullet',
    title: 'Why Most Companies Won\'t Do This',
    subtitle: 'The technology already exists. The barrier is culture, not technology.',
    points: [
      'Most organizations still operate with rigid role boundaries',
      'Knowledge is fragmented across people, threads, and undocumented systems',
      'Without encoded knowledge, AI cannot operate effectively — it has nothing to work with',
    ],
    notes: 'This is the competitive moat argument in reverse. The companies that don\'t act will fall further behind, not just stay still.',
  },

  // ── 23. Section: Early Proof ────────────────────────────────────────────────
  {
    type: 'section',
    title: 'Early Proof: Experiments Already Completed',
    subtitle: 'This approach has already been validated internally.',
    icon: '🧪',
    notes: 'Pivot to evidence. Move from theory to demonstrated results.',
  },

  // ── 24. Experiment 1 ────────────────────────────────────────────────────────
  {
    type: 'bullet',
    title: 'Experiment 1 — Tribal Knowledge Encoding',
    subtitle: 'Encoding context directly into a repository, then testing AI\'s ability to work from it.',
    points: [
      'Encoded tribal knowledge directly into a code repository',
      'Asked AI to fix a bug and build a new feature — using natural language only',
      'It completed both tasks correctly',
      'Proof: when systems contain context, AI can understand and extend them',
    ],
    notes: 'This is the simplest and most direct proof. Context in = capability out.',
  },

  // ── 25. Experiment 2 ────────────────────────────────────────────────────────
  {
    type: 'bullet',
    title: 'Experiment 2 — Customer Chat Widget',
    subtitle: 'From idea to MVP on staging in a single day.',
    points: [
      'Identified an opportunity to prevent third-party billing leakage',
      'Idea → MVP deployed to staging: only a few hours',
      'System was ready for QA the same day',
      'Traditional workflow: the same work would take days or weeks',
    ],
    notes: 'Billing leakage is a high-value, concrete business problem. The timeline compression here is the story.',
  },

  // ── 26. Experiment 3 ────────────────────────────────────────────────────────
  {
    type: 'bullet',
    title: 'Experiment 3 — Review System',
    subtitle: 'A fully production-ready system built in a few days.',
    points: [
      'Built a fully functional review system with scalable architecture',
      'Incorporated security best practices and maintainable code structure',
      'Other engineers can safely extend and maintain it without starting over',
    ],
    notes: 'This one proves quality, not just speed. The output wasn\'t a prototype — it was real, extensible production code.',
  },

  // ── 27. Section: High-ROI Features ──────────────────────────────────────────
  {
    type: 'section',
    title: 'Shipping High-ROI Features While Building the System',
    subtitle: 'Immediate operational value in parallel with long-term infrastructure.',
    icon: '🚀',
    notes: 'Transition to the "what we would build" section. This bridges theory to roadmap.',
  },

  // ── 28. Marketing Opportunities ─────────────────────────────────────────────
  {
    type: 'bullet',
    title: 'High-Leverage Area: Marketing',
    subtitle: 'These improvements directly impact revenue growth.',
    points: [
      'Campaign automation — reduce manual work, increase testing surface',
      'Attribution visibility — understand what is actually driving revenue',
      'Experimentation tools — run more tests with less engineering overhead',
      'Analytics systems — surface insights that currently require manual analysis',
    ],
    notes: 'Marketing is a high-leverage starting point because the ROI is measurable and fast.',
  },

  // ── 29. Customer Service Opportunities ──────────────────────────────────────
  {
    type: 'bullet',
    title: 'High-Leverage Area: Customer Service',
    subtitle: 'Improve customer experience while reducing operational workload.',
    points: [
      'AI support assistants — handle common queries without human intervention',
      'Internal knowledge bots — give the team instant access to institutional knowledge',
      'Automated issue triage — route problems to the right person faster',
      'Customer self-service tools — empower customers to resolve issues independently',
    ],
    notes: 'Customer service is a strong second area — visible to customers and measurable in ticket volume and CSAT.',
  },

  // ── 30. Two Goals in Parallel ───────────────────────────────────────────────
  {
    type: 'bullet',
    title: 'Shipping While Building the Garden',
    subtitle: 'Two goals, pursued simultaneously.',
    points: [
      'Goal 1: Deliver high-impact features quickly — immediate operational value',
      'Goal 2: Build the long-term knowledge ecosystem — compounding organizational intelligence',
      'Every feature becomes another seed in the garden',
      'Over time, these seeds compound into organizational intelligence that cannot be easily replicated',
    ],
    notes: 'This is the "no false choice" frame. We don\'t have to choose between moving fast and building well. The approach makes them the same thing.',
  },

  // ── 31. What Happens If We Do Nothing ───────────────────────────────────────
  {
    type: 'bullet',
    title: 'What Happens If We Do Nothing',
    subtitle: 'Traditional scaling leads to a predictable outcome.',
    points: [
      'Headcount grows — and with it, coordination costs',
      'Knowledge fragments — every departure takes context with it',
      'Innovation slows — teams spend more time managing than creating',
      'Eventually: more time managing complexity than creating value',
    ],
    notes: 'This is the status quo trap. Not a crisis — a slow drain. The cost is hard to see until it\'s very large.',
  },

  // ── 32. The Choice ──────────────────────────────────────────────────────────
  {
    type: 'comparison',
    title: 'The Choice',
    left: {
      heading: 'Traditional Scaling',
      points: [
        'Grow larger',
        'Add headcount to add capacity',
        'Knowledge lives in people',
        'AI as a productivity tool on top',
        'Complexity grows with the org',
      ],
    },
    right: {
      heading: 'Knowledge-Driven Scaling',
      points: [
        'Grow smarter',
        'Add capability per person',
        'Knowledge encoded into the system',
        'AI embedded in the operating environment',
        'Intelligence compounds year over year',
      ],
    },
    notes: 'Let this sit. The left column is the default path — comfortable and familiar. The right column requires intentional design.',
  },

  // ── 33. Visual Model ────────────────────────────────────────────────────────
  {
    type: 'diagram',
    title: 'The AI Garden Organization',
    layers: [
      {
        icon: '🌞',
        label: 'Market & Customers',
        description: 'The environment the garden grows toward',
        color: 'amber',
      },
      {
        icon: '🦋',
        label: 'Pollinators — Marketing & Growth',
        description: 'Spread value from the garden to the market',
        color: 'purple',
      },
      {
        icon: '🌿',
        label: 'Products & Features',
        description: 'Gardeners (Product) · Workers (Engineering) · AI Assistant Workers',
        color: 'green',
      },
      {
        icon: '🌱',
        label: 'Knowledge-Encoded Seeds',
        description: 'Code + Context + Documentation + Intent',
        color: 'emerald',
      },
      {
        icon: '💧',
        label: 'Irrigation Systems',
        description: 'Tools · Processes · AI Agents · Automation',
        color: 'blue',
      },
      {
        icon: '🧠',
        label: 'Technology Ecosystem Map',
        description: 'Documented tools, systems, integrations, costs, ownership, usage',
        color: 'indigo',
      },
      {
        icon: '🌍',
        label: 'Soil — Culture',
        description: 'Learning · Documentation · Trust · Knowledge Sharing · Experimentation',
        color: 'stone',
      },
    ],
    notes: 'Walk bottom-up. Culture is the foundation. Seeds are planted into it. Irrigation feeds them. Products grow. Pollinators spread. Market receives.',
  },

  // ── 34. Final Thought ────────────────────────────────────────────────────────
  {
    type: 'hero',
    title: 'Great companies don\'t just build products.',
    subtitle: 'They build systems that allow innovation to compound.',
    notes: 'Open with this, then deliver the rest verbally: "If we start planting seeds today, we won\'t just move faster — we\'ll build an organization that gets smarter every year it exists."',
  },

  // ── 35. Meta Proof ──────────────────────────────────────────────────────────
  {
    type: 'bullet',
    title: 'Meta Proof',
    subtitle: 'This presentation is itself a demonstration of the model.',
    points: [
      'This slide deck was produced using a seed engine for presentations — conceived, written, and deployed in under an hour',
      'Written entirely on a phone, walking back and forth in a room for exercise',
      'The engine is robust enough to generate slides for anyone — governance docs can be edited in natural language',
      'The seed encoded its own intent, structure, and reasoning — ready to extend',
    ],
    notes: 'This is the closer. Don\'t just describe the model — point at it. The deck they just watched is proof the system works.',
  },

  // ── 36. What We Could Build Next ────────────────────────────────────────────
  {
    type: 'icon-card',
    title: 'Other Ideas Already in View',
    cards: [
      {
        icon: '📅',
        label: 'Promo Calendar Optimizer',
        description: 'Runs locally with a local LLM — no data leakage. Real data in, optimized projections out.',
      },
      {
        icon: '📊',
        label: 'KPI Number Cruncher',
        description: 'Local automation + queryable local LLM. Founder-level insight without exposing sensitive data externally.',
      },
      {
        icon: '🔒',
        label: 'Secure Knowledge Retrieval',
        description: 'Sensitive tribal knowledge stored behind AWS IAM — accessible to AI, not exposed in GitHub.',
      },
      {
        icon: '🖥️',
        label: 'Air-Gapped Local LLM Lab',
        description: 'Mac mini with zero internet access. Freely experiment with local models on real, sensitive data.',
      },
    ],
    columns: 2,
    notes: 'These are early-stage ideas. The point is that the model generates more ideas naturally — once seeds exist, next seeds come faster.',
  },
]

export default slides
