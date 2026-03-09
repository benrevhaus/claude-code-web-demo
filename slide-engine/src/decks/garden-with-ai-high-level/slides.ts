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
    type: 'comparison',
    title: 'The Opportunity',
    left: {
      heading: 'The Shallow Play',
      points: [
        'Adopt AI as a productivity tool',
        'Layer it on top of existing org structure',
        'Incremental gains in individual output',
        'AI cannot do much without context',
        'Most companies will stop here',
      ],
    },
    right: {
      heading: 'The Deeper Opportunity',
      points: [
        'Redesign how the company captures knowledge',
        'Embed AI into the operating environment itself',
        'Structural gains in organizational capability',
        'AI becomes dramatically more useful with rich context',
        'Very few companies will get here',
      ],
    },
    notes: 'The key contrast is "AI as tool" vs. "AI as operating environment." Pause on the right column — this is the thesis.',
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
    type: 'icon-card',
    title: 'The Strategic Advantage',
    subtitle: 'Competitors can copy features. They cannot easily copy years of encoded organizational knowledge.',
    cards: [
      { icon: '🚀', label: 'Faster Onboarding', description: 'New hires inherit context immediately — no months of tribal knowledge transfer' },
      { icon: '⚡', label: 'Faster Iteration', description: 'Less rediscovery, more building — teams spend time creating, not re-learning' },
      { icon: '🤖', label: 'More Capable AI', description: 'AI agents become dramatically more useful when they have rich context to work with' },
      { icon: '🔍', label: 'Self-Explanatory Systems', description: 'Anyone can understand and extend them — the system explains itself' },
    ],
    columns: 2,
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
    type: 'icon-card',
    title: 'What Healthy Gardens Require',
    subtitle: 'Organizations work the same way.',
    cards: [
      { icon: '🌍', label: 'Good Soil', description: 'Culture and environment — the foundation that enables everything else to grow' },
      { icon: '🌱', label: 'Careful Planting', description: 'Deliberate decisions about what to build, what problems to solve, where to invest' },
      { icon: '💧', label: 'Irrigation Systems', description: 'Tools, workflows, and automation that ensure consistent delivery regardless of conditions' },
      { icon: '🦋', label: 'Pollination', description: 'Spreading value to customers and the market — even great gardens need pollinators' },
      { icon: '✂️', label: 'Pruning', description: 'Removing waste and complexity intentionally — healthy growth requires it' },
      { icon: '🌪️', label: 'Resilience to Storms', description: 'The ability to withstand disruption — designed in, not hoped for' },
    ],
    columns: 3,
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
    type: 'comparison',
    title: 'Irrigation Systems',
    left: {
      heading: 'Rain',
      points: [
        'Luck and market timing',
        'External opportunity',
        'Unpredictable and unreliable',
        'Cannot be planned around',
        'Most companies depend on this',
      ],
    },
    right: {
      heading: 'Irrigation',
      points: [
        'Tools, workflows, and automation',
        'Knowledge systems and internal infrastructure',
        'Consistent growth regardless of conditions',
        'Built before drought, not during it',
        'This is what separates resilient orgs',
      ],
    },
    notes: 'The irrigation metaphor is the argument against "we\'ll figure it out when we need it." You build the pipes before drought.',
  },

  // ── 13. Storms ──────────────────────────────────────────────────────────────
  {
    type: 'quote',
    text: 'Organizations cannot stop storms. But they can build resilience — and that is entirely a design choice.',
    notes: 'Keep this brief. Economic uncertainty, global events, technology disruption, supply chain shifts — all unavoidable. Resilience is the only variable.',
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
    type: 'comparison',
    title: 'Democratizing Creation',
    left: {
      heading: 'Traditional Path',
      points: [
        'Idea surfaces somewhere in the org',
        'Spec written, prioritized, scheduled',
        'Engineering builds it',
        'QA, documentation, deployment',
        'Weeks or months later: shipped',
        'Creation bottlenecked by engineering capacity',
      ],
    },
    right: {
      heading: 'New Model',
      points: [
        'Anyone in the org can express an idea',
        'Prototype a tool in natural language',
        'Generate a system with AI assistance',
        'Document the reasoning as you go',
        'Same day or same week: shipped',
        'Bottleneck shifts to idea quality, not capacity',
      ],
    },
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
    type: 'comparison',
    title: 'Scaling Value Without Scaling Headcount',
    left: {
      heading: 'Traditional Scaling',
      points: [
        'More products → more engineers',
        'More customers → more support staff',
        'More systems → more operators',
        'Coordination overhead grows with headcount',
        'Decisions slow down as the org gets larger',
        'Complexity becomes the product',
      ],
    },
    right: {
      heading: 'AI-Enabled Scaling',
      points: [
        'Each employee gains AI assistants',
        'Each employee gains AI researchers',
        'Each employee gains AI builders and analysts',
        'The org becomes a hybrid human-AI workforce',
        'Decisions stay fast because context is encoded',
        'Intelligence compounds, complexity does not',
      ],
    },
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
    type: 'proof-point',
    title: 'Experiment 1 — Tribal Knowledge Encoding',
    metric: 'Bug fixed. Feature shipped.',
    metricLabel: 'Natural language only — zero code written by hand',
    narrative: 'Encoded tribal knowledge directly into a code repository. Asked AI to fix a bug and build a new feature using only natural language instructions. It completed both tasks correctly.',
    comparison: 'vs. days of onboarding a new engineer to the same codebase',
    notes: 'This is the simplest and most direct proof. Context in = capability out.',
  },

  // ── 25. Experiment 2 ────────────────────────────────────────────────────────
  {
    type: 'proof-point',
    title: 'Experiment 2 — Customer Chat Widget',
    metric: 'A few hours',
    metricLabel: 'Idea to MVP deployed on staging — same day',
    narrative: 'Identified an opportunity to prevent third-party billing leakage. From the moment the idea was conceived to a working MVP on staging, only a few hours passed. The system was ready for QA the same day.',
    comparison: 'vs. days or weeks on the traditional engineering workflow',
    notes: 'Billing leakage is a high-value, concrete business problem. The timeline compression here is the story.',
  },

  // ── 26. Experiment 3 ────────────────────────────────────────────────────────
  {
    type: 'proof-point',
    title: 'Experiment 3 — Review System',
    metric: 'Production-ready',
    metricLabel: 'Scalable architecture, security best practices, fully extensible — in days',
    narrative: 'Built a fully functional review system in a matter of days. It incorporated security best practices and a maintainable code structure. Other engineers can safely extend it without starting over.',
    comparison: 'vs. weeks — and the output is indistinguishable from senior engineering work',
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
    type: 'comparison',
    title: 'Shipping While Building the Garden',
    left: {
      heading: 'Goal 1: Ship Now',
      points: [
        'Deliver high-impact features immediately',
        'Measurable operational value from week one',
        'Each feature proves the model in practice',
        'Fast wins build organizational confidence',
        'The business moves forward while the system is built',
      ],
    },
    right: {
      heading: 'Goal 2: Build the Garden',
      points: [
        'Every feature becomes a knowledge seed',
        'Seeds compound into organizational intelligence',
        'The system becomes harder to replicate over time',
        'AI becomes more capable as context accumulates',
        'Long-term advantage grows with every sprint',
      ],
    },
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
    type: 'proof-point',
    title: 'Meta Proof: This Deck Is a Seed',
    metric: '< 1 hour',
    metricLabel: 'Conceived, written, and deployed — on a phone, walking laps in a room',
    narrative: 'This slide deck was produced using the same seed engine it describes. The engine is robust enough to generate slides for anyone. The governance documents can be edited in natural language. The seed encoded its own intent, structure, and reasoning — ready to extend.',
    comparison: 'vs. the hours or days a typical executive deck requires',
    notes: 'This is the closer. Don\'t just describe the model — point at it. The deck they just watched is proof the system works.',
  },

  // ── 36. Seed Architecture: WORKFLOW_TEMPLATE.md ─────────────────────────────
  {
    type: 'seed-doc',
    title: 'What a Seed Actually Looks Like',
    filename: 'WORKFLOW_TEMPLATE.md',
    description: 'Every workflow in the system is encoded as a structured artifact — readable by humans and AI alike.',
    groups: [
      {
        label: 'Identity',
        color: 'blue',
        sections: ['Workflow Metadata', 'Purpose', 'Trigger'],
      },
      {
        label: 'Structure',
        color: 'green',
        sections: ['Actors', 'Inputs', 'Preconditions', 'Rules'],
      },
      {
        label: 'Behavior',
        color: 'purple',
        sections: ['Decision Points', 'Actions', 'Exceptions / Escalations'],
      },
      {
        label: 'Outputs & Dependencies',
        color: 'amber',
        sections: ['Outputs', 'Data Dependencies'],
      },
      {
        label: 'Interface & Automation',
        color: 'cyan',
        sections: ['Interface Trigger', 'Automation Function'],
      },
      {
        label: 'Governance & Learning',
        color: 'rose',
        sections: ['Logging / Audit', 'Tutorial Intent', 'Design Notes', 'Technical Constraints'],
      },
      {
        label: 'Grounding',
        color: 'indigo',
        sections: ['Example Instance'],
      },
    ],
    highlight: [
      'Read this artifact before generating code.',
      'Preserve workflow intent.',
      'Never place business logic solely in the interface layer.',
      'Use the automation function as the execution boundary.',
      'Update related docs and registry entries when modifying workflows.',
    ],
    notes: 'This is the answer to "what does a seed look like?" Every workflow is encoded as this artifact. AI reads the contract before writing a line of code. Humans can read it too — that\'s the point. The schema is the shared language.',
  },

  // ── 37. The Build Flow ───────────────────────────────────────────────────────
  {
    type: 'timeline',
    title: 'From Idea to Launch: The AI-Assisted Build Flow',
    items: [
      {
        icon: '🌱',
        label: 'Ideation → Seed Artifact',
        description: 'Custom GPT converts raw idea into a structured WORKFLOW_TEMPLATE.md. Guardrailed: business rules, intent, and constraints encoded before any code is written.',
      },
      {
        icon: '🖥️',
        label: 'Natural Language Prototype',
        description: 'Local Claude on a Vite/React scaffold turns the seed into a working mockup using natural language only. Guardrailed: AI reads the seed contract — no rogue logic.',
      },
      {
        icon: '🔧',
        label: 'Engineering Feasibility Review',
        description: 'Engineers review the prototype and seed for technical constraints, integration points, and architectural fit. Go / revise decision made here.',
      },
      {
        icon: '🎨',
        label: 'Design Handoff',
        description: 'Design fleshes out the UX using the prototype as a reference. Visual language, accessibility, edge cases resolved. Seed updated with design notes.',
      },
      {
        icon: '⚙️',
        label: 'Engineering Integration',
        description: 'Engineers build from the approved design, referencing the seed for business logic boundaries. AI assists with implementation, not architecture.',
      },
      {
        icon: '🧪',
        label: 'Staging MVP → QA',
        description: 'Working build deployed to staging. QA validates against the seed\'s acceptance criteria and example instance. Issues resolved before production.',
      },
      {
        icon: '🚀',
        label: 'Launch',
        description: 'Deployed to production. Seed archived as a permanent knowledge artifact — ready to extend, explain, or hand off to any new team member or AI agent.',
      },
    ],
    notes: 'Walk through each stage. The critical point: the seed travels the entire flow. It starts at ideation and ends archived in production. Every handoff references the same artifact — no context lost between steps.',
  },

  // ── 38. External Validation: Podcast Alignment ──────────────────────────────
  {
    type: 'bullet',
    title: 'Independent Validation — Added Live Before This Meeting',
    subtitle: 'Podcast: "How to Make AI Work for Your Brand With Two Enterprise Insiders" — listened to it this morning. Their thesis maps directly onto this deck.',
    points: [
      'Democratize AI tools to individuals — not just IT or engineering. Every person in the org should have access, not just specialists.',
      'Employees must learn AI. Literacy is not optional — it\'s the new baseline competency for knowledge workers.',
      'Culture has to foster it. Without psychological safety to experiment, tools go unused and the org falls behind regardless of what it buys.',
      'The Garden Model is the operational answer to all three: seeds make AI accessible to non-engineers, the workflow embeds learning into the process, and encoding knowledge openly builds the culture of sharing.',
    ],
    notes: 'Use this slide to show that the approach is not isolated thinking — enterprise practitioners are arriving at the same conclusions independently. The meta-point: this slide was added during the podcast, minutes before this meeting. That\'s the system working in real time.',
  },

  // ── 39. The Creativity Gap & Governance ─────────────────────────────────────
  {
    type: 'comparison',
    title: 'The Creativity Gap — and Why Governance Isn\'t Optional',
    left: {
      heading: 'The Opportunity: Close the Creativity Gap',
      points: [
        'Most people have ideas they can\'t build — the gap between imagination and execution is an engineering bottleneck',
        'AI closes this gap. Non-engineers can now prototype, test, and ship',
        'Celebrate small wins. The first time someone outside engineering ships a working tool is a cultural milestone worth marking',
        'Each win builds confidence, literacy, and appetite for the next one',
        'This is how AI adoption actually takes root — not top-down mandates, but bottom-up momentum',
      ],
    },
    right: {
      heading: 'The Risk: Ungoverned Creativity Becomes Sprawl',
      points: [
        'Without structure, prototypes become production systems no one owns',
        'Duplicate tools get built because nobody knew the first one existed',
        'Business logic lives in prompts, not seeds — invisible and unauditable',
        'Costs accumulate silently across subscriptions, tokens, and API calls',
        'The garden becomes a jungle. Fast to grow, impossible to maintain',
        'Governance isn\'t bureaucracy — it\'s the schema that makes creativity composable',
      ],
    },
    notes: 'This is the maturity slide. You want the creativity. You want the small wins. But each win needs to land as a seed, not a one-off. The workflow template is what converts a clever prototype into a permanent organizational asset. Without it, you\'re gardening without beds — everything grows, nothing is findable.',
  },

  // ── 40. Real-Time Knowledge Capture as a Standard ───────────────────────────
  {
    type: 'bullet',
    title: 'This Should Be a New Organizational Standard',
    subtitle: 'The fact that these slides were built in real time — while listening to a podcast, during a meeting — is not a trick. It\'s a repeatable practice that every department should eventually own.',
    points: [
      'Every meeting, conference, podcast, or debrief produces insights that currently disappear. The standard should be: if something is worth listening to, it\'s worth capturing as a seed.',
      'Real-time capture closes the gap between insight and artifact. The knowledge doesn\'t have to be reconstructed from memory later — it\'s already structured when it\'s still fresh.',
      'This scales across departments. Marketing captures campaign learnings. Customer service captures resolution patterns. Leadership captures strategic decisions. Each department builds its own queryable knowledge base.',
      'Queryable safely: a local LLM with internet off means sensitive internal knowledge never leaves the building. The org can ask questions of its own institutional memory without exposure.',
      'Over time, the organization\'s knowledge base becomes its most durable competitive asset — not its people\'s memories, not its Slack history, but a structured, searchable, AI-readable archive that compounds every year.',
    ],
    notes: 'This is the long-game vision slide. The podcast example from slide 38 and the live additions today aren\'t anecdotes — they\'re demonstrations of a practice. The question isn\'t whether this is possible. It\'s whether the org decides to make it standard. Frame it as a culture decision, not a technology decision.',
  },

  // ── 41. What We Could Build Next ────────────────────────────────────────────
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
