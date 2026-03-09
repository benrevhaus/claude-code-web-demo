import { motion } from 'framer-motion'
import type { IconCardSlideProps } from '../engine/types'

const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.2 } },
}

const cardItem = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
}

export default function IconCardSlide({ title, cards, columns }: IconCardSlideProps) {
  const cols = columns ?? (cards.length <= 2 ? 2 : cards.length <= 4 ? 2 : 3)
  const gridCols: Record<number, string> = {
    2: 'repeat(2, 1fr)',
    3: 'repeat(3, 1fr)',
    4: 'repeat(4, 1fr)',
  }

  return (
    <div
      className="w-full h-full flex flex-col justify-center overflow-hidden"
      style={{ background: 'var(--color-bg, #0a0a0f)', padding: 'var(--slide-padding, 5rem)' }}
    >
      {title && (
        <motion.h2
          className="slide-title mb-10"
          style={{
            fontSize: 'clamp(1.8rem, 3.5vw, 3rem)',
            color: 'var(--color-fg, #f0f0f5)',
            fontFamily: 'var(--font-heading)',
          }}
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {title}
        </motion.h2>
      )}

      <motion.div
        className="grid gap-5"
        style={{ gridTemplateColumns: gridCols[cols] ?? gridCols[3] }}
        variants={container}
        initial="hidden"
        animate="visible"
      >
        {cards.map((card, i) => (
          <motion.div
            key={i}
            className="flex flex-col gap-4 p-7 rounded-2xl"
            style={{
              background: 'var(--color-card-bg, #13131f)',
              border: '1px solid var(--color-border, #2a2a3e)',
            }}
            variants={cardItem}
          >
            <div className="text-4xl">{card.icon}</div>
            <div>
              <p
                className="font-semibold mb-2"
                style={{
                  fontSize: 'clamp(0.9rem, 1.8vw, 1.5rem)',
                  color: 'var(--color-fg, #f0f0f5)',
                  fontFamily: 'var(--font-heading)',
                }}
              >
                {card.label}
              </p>
              <p
                className="leading-relaxed"
                style={{
                  fontSize: 'clamp(0.75rem, 1.3vw, 1.1rem)',
                  color: 'var(--color-muted, #9ca3af)',
                }}
              >
                {card.description}
              </p>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}
