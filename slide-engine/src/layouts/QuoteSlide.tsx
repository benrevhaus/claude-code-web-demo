import { motion } from 'framer-motion'
import type { QuoteSlideProps } from '../engine/types'

export default function QuoteSlide({ text, attribution }: QuoteSlideProps) {
  return (
    <div
      className="relative w-full h-full flex flex-col items-center justify-center text-center overflow-hidden"
      style={{ background: 'var(--color-bg, #0a0a0f)', padding: 'var(--slide-padding, 5rem)' }}
    >
      {/* Background decoration */}
      <div
        className="absolute inset-0 pointer-events-none flex items-center justify-center"
        style={{ opacity: 0.03 }}
      >
        <span
          className="font-extrabold select-none"
          style={{
            fontSize: '40vw',
            color: 'var(--color-accent, #6366f1)',
            fontFamily: 'var(--font-heading)',
            lineHeight: 1,
          }}
        >
          "
        </span>
      </div>

      <motion.div
        className="relative z-10 flex flex-col items-center gap-10"
        style={{ maxWidth: '1100px' }}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Opening quote mark */}
        <div
          className="text-6xl font-extrabold leading-none select-none"
          style={{ color: 'var(--color-accent, #6366f1)', fontFamily: 'var(--font-heading)' }}
        >
          "
        </div>

        <p
          className="font-semibold leading-tight"
          style={{
            fontSize: 'clamp(1.5rem, 4vw, 3.5rem)',
            color: 'var(--color-fg, #f0f0f5)',
            fontFamily: 'var(--font-heading)',
            letterSpacing: '-0.02em',
          }}
        >
          {text}
        </p>

        {attribution && (
          <motion.p
            className="text-center"
            style={{
              fontSize: 'clamp(0.85rem, 1.5vw, 1.3rem)',
              color: 'var(--color-muted, #9ca3af)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.4 }}
          >
            — {attribution}
          </motion.p>
        )}
      </motion.div>
    </div>
  )
}
