import { motion } from 'framer-motion'
import type { SectionSlideProps } from '../engine/types'

const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
}

const item = {
  hidden: { opacity: 0, x: -24 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
}

export default function SectionSlide({ title, subtitle, icon }: SectionSlideProps) {
  return (
    <div
      className="relative w-full h-full flex flex-col justify-center overflow-hidden"
      style={{ background: 'var(--color-bg, #0a0a0f)', padding: 'var(--slide-padding, 5rem)' }}
    >
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: 'var(--color-accent, #6366f1)' }}
      />

      <motion.div
        className="flex flex-col gap-5 pl-12"
        style={{ maxWidth: '900px' }}
        variants={container}
        initial="hidden"
        animate="visible"
      >
        {icon && (
          <motion.div
            className="text-6xl mb-2"
            variants={item}
          >
            {icon}
          </motion.div>
        )}

        <motion.div variants={item}>
          <p
            className="text-sm font-semibold uppercase tracking-widest mb-4"
            style={{ color: 'var(--color-accent, #6366f1)' }}
          >
            Section
          </p>
        </motion.div>

        <motion.h2
          className="slide-title"
          style={{
            fontSize: 'clamp(2.5rem, 5.5vw, 5rem)',
            color: 'var(--color-fg, #f0f0f5)',
            fontFamily: 'var(--font-heading)',
          }}
          variants={item}
        >
          {title}
        </motion.h2>

        {subtitle && (
          <motion.p
            className="slide-subtitle"
            style={{ fontSize: 'clamp(1rem, 2vw, 1.6rem)', maxWidth: '700px' }}
            variants={item}
          >
            {subtitle}
          </motion.p>
        )}
      </motion.div>
    </div>
  )
}
