import { motion } from 'framer-motion'
import type { SeedDocSlideProps } from '../engine/types'

const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.15 } },
}

const item = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
}

const colorMap: Record<string, { bg: string; border: string; text: string; label: string }> = {
  blue:    { bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.25)',  text: '#93c5fd', label: '#60a5fa' },
  green:   { bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.25)',   text: '#86efac', label: '#4ade80' },
  purple:  { bg: 'rgba(168,85,247,0.08)',  border: 'rgba(168,85,247,0.25)',  text: '#d8b4fe', label: '#c084fc' },
  amber:   { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)',  text: '#fcd34d', label: '#fbbf24' },
  rose:    { bg: 'rgba(244,63,94,0.08)',   border: 'rgba(244,63,94,0.25)',   text: '#fda4af', label: '#fb7185' },
  cyan:    { bg: 'rgba(6,182,212,0.08)',   border: 'rgba(6,182,212,0.25)',   text: '#67e8f9', label: '#22d3ee' },
  indigo:  { bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.25)', text: '#a5b4fc', label: '#818cf8' },
  default: { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.10)', text: '#d1d5db', label: '#9ca3af' },
}

export default function SeedDocSlide({ title, filename, description, groups, highlight }: SeedDocSlideProps) {
  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden"
      style={{ background: 'var(--color-bg, #0a0a0f)', padding: 'var(--slide-padding, 4rem)' }}
    >
      {/* Header row */}
      <motion.div
        className="flex items-start justify-between mb-6"
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div>
          {title && (
            <h2
              className="slide-title mb-1"
              style={{
                fontSize: 'clamp(1.5rem, 2.8vw, 2.4rem)',
                color: 'var(--color-fg, #f0f0f5)',
                fontFamily: 'var(--font-heading)',
              }}
            >
              {title}
            </h2>
          )}
          {description && (
            <p style={{ fontSize: 'clamp(0.75rem, 1.2vw, 1rem)', color: 'var(--color-muted, #9ca3af)' }}>
              {description}
            </p>
          )}
        </div>

        {/* Filename chip */}
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-lg flex-shrink-0 ml-6"
          style={{
            background: '#13131f',
            border: '1px solid #2a2a3e',
            fontFamily: 'var(--font-mono, monospace)',
          }}
        >
          <span style={{ fontSize: '1.1rem' }}>📄</span>
          <span style={{ fontSize: 'clamp(0.65rem, 1vw, 0.85rem)', color: '#7c86c2' }}>{filename}</span>
        </div>
      </motion.div>

      {/* Main body: groups left, highlight right */}
      <div className="flex gap-5 flex-1 min-h-0">

        {/* Left: section groups */}
        <motion.div
          className="flex flex-col gap-3 overflow-auto"
          style={{ flex: '1 1 55%' }}
          variants={container}
          initial="hidden"
          animate="visible"
        >
          {groups.map((group, gi) => {
            const c = colorMap[group.color ?? 'default']
            return (
              <motion.div
                key={gi}
                className="rounded-xl px-4 py-3"
                style={{ background: c.bg, border: `1px solid ${c.border}` }}
                variants={item}
              >
                <p
                  className="font-semibold mb-2"
                  style={{
                    fontSize: 'clamp(0.65rem, 1vw, 0.85rem)',
                    color: c.label,
                    fontFamily: 'var(--font-heading)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {group.sections.map((sec, si) => (
                    <span
                      key={si}
                      className="px-2 py-0.5 rounded"
                      style={{
                        fontSize: 'clamp(0.6rem, 0.9vw, 0.78rem)',
                        color: c.text,
                        background: 'rgba(255,255,255,0.05)',
                        fontFamily: 'var(--font-mono, monospace)',
                      }}
                    >
                      {sec}
                    </span>
                  ))}
                </div>
              </motion.div>
            )
          })}
        </motion.div>

        {/* Right: AI Instructions highlight block */}
        {highlight && highlight.length > 0 && (
          <motion.div
            className="flex flex-col rounded-xl p-5 overflow-auto"
            style={{
              flex: '1 1 42%',
              background: 'rgba(99,102,241,0.07)',
              border: '1px solid rgba(99,102,241,0.28)',
            }}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <p
              className="font-semibold mb-4"
              style={{
                fontSize: 'clamp(0.65rem, 1vw, 0.85rem)',
                color: '#818cf8',
                fontFamily: 'var(--font-heading)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              ## AI Instructions
            </p>
            <div className="flex flex-col gap-2.5">
              {highlight.map((line, li) => (
                <motion.div
                  key={li}
                  className="flex gap-3 items-start"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 0.4 + li * 0.07 }}
                >
                  <span
                    className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center mt-0.5"
                    style={{
                      background: 'rgba(99,102,241,0.2)',
                      color: '#818cf8',
                      fontSize: '0.65rem',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {li + 1}
                  </span>
                  <p
                    className="leading-snug"
                    style={{
                      fontSize: 'clamp(0.7rem, 1.05vw, 0.9rem)',
                      color: '#c7d2fe',
                      fontFamily: 'var(--font-mono, monospace)',
                    }}
                  >
                    {line}
                  </p>
                </motion.div>
              ))}
            </div>

            {/* Separator */}
            <div
              className="mt-auto pt-4 border-t"
              style={{ borderColor: 'rgba(99,102,241,0.2)' }}
            >
              <p
                style={{
                  fontSize: 'clamp(0.6rem, 0.85vw, 0.75rem)',
                  color: 'rgba(129,140,248,0.6)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                Every seed carries this contract. AI reads it before generating code.
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
