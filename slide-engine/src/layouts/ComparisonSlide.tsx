import { motion } from 'framer-motion'
import type { ComparisonSlideProps } from '../engine/types'

const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
}

const colLeft = {
  hidden: { opacity: 0, x: -30 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
}

const colRight = {
  hidden: { opacity: 0, x: 30 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
}

const bulletItem = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
}

interface ColumnProps {
  heading: string
  points: string[]
  accentColor: string
  side: 'left' | 'right'
}

function Column({ heading, points, accentColor, side }: ColumnProps) {
  return (
    <motion.div
      className="flex-1 flex flex-col gap-7 p-10 rounded-2xl"
      style={{
        background: 'var(--color-card-bg, #13131f)',
        border: '1px solid var(--color-border, #2a2a3e)',
      }}
      variants={side === 'left' ? colLeft : colRight}
    >
      <div
        className="text-xs font-bold uppercase tracking-widest"
        style={{ color: accentColor }}
      >
        {side === 'left' ? 'Before' : 'After'}
      </div>
      <h3
        className="font-bold leading-tight"
        style={{
          fontSize: 'clamp(1.2rem, 2.5vw, 2.2rem)',
          color: 'var(--color-fg, #f0f0f5)',
          fontFamily: 'var(--font-heading)',
        }}
      >
        {heading}
      </h3>
      <ul className="flex flex-col gap-4">
        {points.map((pt, i) => (
          <motion.li key={i} className="flex items-start gap-3" variants={bulletItem}>
            <span
              className="flex-shrink-0 w-1.5 h-1.5 rounded-full mt-2"
              style={{ background: accentColor }}
            />
            <span
              style={{
                fontSize: 'clamp(0.85rem, 1.6vw, 1.4rem)',
                color: 'var(--color-fg)',
                opacity: 0.85,
                lineHeight: 1.5,
              }}
            >
              {pt}
            </span>
          </motion.li>
        ))}
      </ul>
    </motion.div>
  )
}

export default function ComparisonSlide({ title, left, right }: ComparisonSlideProps) {
  return (
    <div
      className="w-full h-full flex flex-col justify-center overflow-hidden"
      style={{ background: 'var(--color-bg, #0a0a0f)', padding: 'var(--slide-padding, 5rem)' }}
    >
      <motion.div
        className="flex flex-col gap-8 h-full justify-center"
        variants={container}
        initial="hidden"
        animate="visible"
      >
        {/* Title */}
        <motion.h2
          className="slide-title"
          style={{
            fontSize: 'clamp(1.8rem, 3.5vw, 3rem)',
            color: 'var(--color-fg, #f0f0f5)',
            fontFamily: 'var(--font-heading)',
          }}
          variants={colLeft}
        >
          {title}
        </motion.h2>

        {/* Columns */}
        <div className="flex gap-6 flex-1" style={{ maxHeight: '70%' }}>
          <Column heading={left.heading} points={left.points} accentColor="var(--color-muted, #9ca3af)" side="left" />
          <Column heading={right.heading} points={right.points} accentColor="var(--color-accent, #6366f1)" side="right" />
        </div>
      </motion.div>
    </div>
  )
}
