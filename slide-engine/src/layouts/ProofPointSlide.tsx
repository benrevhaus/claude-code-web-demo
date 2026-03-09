import { motion } from 'framer-motion'
import type { ProofPointSlideProps } from '../engine/types'

const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.15, delayChildren: 0.1 } },
}

const item = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
}

export default function ProofPointSlide({
  title,
  metric,
  metricLabel,
  narrative,
  comparison,
}: ProofPointSlideProps) {
  return (
    <div
      className="w-full h-full flex flex-col justify-center overflow-hidden"
      style={{ background: 'var(--color-bg, #0a0a0f)', padding: 'var(--slide-padding, 5rem)' }}
    >
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 60% at 30% 50%, var(--color-accent, #6366f1)12 0%, transparent 70%)',
        }}
      />

      <motion.div
        className="relative z-10 flex flex-col gap-8"
        style={{ maxWidth: '1100px' }}
        variants={container}
        initial="hidden"
        animate="visible"
      >
        {/* Title */}
        <motion.p
          className="text-sm font-semibold uppercase tracking-widest"
          style={{ color: 'var(--color-accent, #6366f1)' }}
          variants={item}
        >
          {title}
        </motion.p>

        {/* Big metric */}
        <motion.div variants={item}>
          <div
            className="font-extrabold leading-none tracking-tight"
            style={{
              fontSize: 'clamp(4rem, 12vw, 10rem)',
              color: 'var(--color-fg, #f0f0f5)',
              fontFamily: 'var(--font-heading)',
            }}
          >
            {metric}
          </div>
          <div
            className="mt-2 font-medium"
            style={{
              fontSize: 'clamp(0.9rem, 1.8vw, 1.5rem)',
              color: 'var(--color-muted, #9ca3af)',
            }}
          >
            {metricLabel}
            {comparison && (
              <span className="ml-3 opacity-60">{comparison}</span>
            )}
          </div>
        </motion.div>

        {/* Divider */}
        <motion.div
          className="w-20 h-0.5 rounded"
          style={{ background: 'var(--color-border, #2a2a3e)' }}
          variants={item}
        />

        {/* Narrative */}
        <motion.p
          style={{
            fontSize: 'clamp(1rem, 2.2vw, 1.8rem)',
            color: 'var(--color-fg, #f0f0f5)',
            opacity: 0.8,
            lineHeight: 1.6,
            maxWidth: '800px',
          }}
          variants={item}
        >
          {narrative}
        </motion.p>
      </motion.div>
    </div>
  )
}
