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
]

export default slides
