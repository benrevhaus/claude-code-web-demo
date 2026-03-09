import { motion } from 'framer-motion'
import type { TimelineSlideProps } from '../engine/types'

const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.12, delayChildren: 0.2 } },
}

const timelineItem = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
}

export default function TimelineSlide({ title, items }: TimelineSlideProps) {
  return (
    <div
      className="w-full h-full flex flex-col justify-center overflow-hidden"
      style={{ background: 'var(--color-bg, #0a0a0f)', padding: 'var(--slide-padding, 5rem)' }}
    >
      {title && (
        <motion.h2
          className="slide-title mb-12"
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
        className="flex flex-col gap-0 relative"
        variants={container}
        initial="hidden"
        animate="visible"
      >
        {/* Vertical line */}
        <div
          className="absolute left-5 top-0 bottom-0 w-0.5"
          style={{ background: 'var(--color-border, #2a2a3e)' }}
        />

        {items.map((item, i) => {
          const isLast = i === items.length - 1
          return (
            <motion.div
              key={i}
              className="flex items-start gap-7 pb-8 relative"
              variants={timelineItem}
            >
              {/* Node */}
              <div
                className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg z-10"
                style={{
                  background: isLast ? 'var(--color-accent, #6366f1)' : 'var(--color-subtle, #1e1e2e)',
                  border: `2px solid ${isLast ? 'var(--color-accent, #6366f1)' : 'var(--color-border, #2a2a3e)'}`,
                }}
              >
                {item.icon ? (
                  <span>{item.icon}</span>
                ) : (
                  <span
                    className="text-xs font-bold"
                    style={{ color: isLast ? '#fff' : 'var(--color-muted, #9ca3af)' }}
                  >
                    {i + 1}
                  </span>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 pt-1.5">
                <p
                  className="font-semibold"
                  style={{
                    fontSize: 'clamp(0.9rem, 1.8vw, 1.5rem)',
                    color: isLast ? 'var(--color-fg, #f0f0f5)' : 'var(--color-fg, #f0f0f5)',
                    opacity: isLast ? 1 : 0.8,
                    fontFamily: 'var(--font-heading)',
                  }}
                >
                  {item.label}
                </p>
                {item.description && (
                  <p
                    className="mt-1"
                    style={{
                      fontSize: 'clamp(0.75rem, 1.3vw, 1.1rem)',
                      color: 'var(--color-muted, #9ca3af)',
                      lineHeight: 1.5,
                    }}
                  >
                    {item.description}
                  </p>
                )}
              </div>
            </motion.div>
          )
        })}
      </motion.div>
    </div>
  )
}
