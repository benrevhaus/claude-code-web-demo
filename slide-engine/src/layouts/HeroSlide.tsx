import { motion } from 'framer-motion'
import type { HeroSlideProps } from '../engine/types'

const container = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.1 },
  },
}

const item = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
}

export default function HeroSlide({ title, subtitle, accent }: HeroSlideProps) {
  const accentColor = accent ?? 'var(--color-accent, #6366f1)'

  return (
    <div
      className="relative w-full h-full flex flex-col items-center justify-center text-center overflow-hidden"
      style={{ background: 'var(--color-bg, #0a0a0f)', padding: 'var(--slide-padding, 5rem)' }}
    >
      {/* Radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 70% 50% at 50% 50%, ${accentColor}18 0%, transparent 70%)`,
        }}
      />

      <motion.div
        className="relative z-10 flex flex-col items-center gap-8"
        style={{ maxWidth: 'var(--content-max-width, 1400px)' }}
        variants={container}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={item}>
          <div
            className="w-12 h-1 rounded-full mx-auto mb-8"
            style={{ background: accentColor }}
          />
        </motion.div>

        <motion.h1
          className="slide-title"
          style={{
            fontSize: 'clamp(2.5rem, 6vw, 5.5rem)',
            color: 'var(--color-fg, #f0f0f5)',
            fontFamily: 'var(--font-heading)',
          }}
          variants={item}
        >
          {title}
        </motion.h1>

        {subtitle && (
          <motion.p
            className="slide-subtitle"
            style={{
              fontSize: 'clamp(1.1rem, 2.2vw, 2rem)',
              maxWidth: '800px',
            }}
            variants={item}
          >
            {subtitle}
          </motion.p>
        )}
      </motion.div>
    </div>
  )
}
