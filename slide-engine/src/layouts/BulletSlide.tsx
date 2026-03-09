import { motion } from 'framer-motion'
import type { BulletSlideProps } from '../engine/types'

const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.2 } },
}

const titleItem = {
  hidden: { opacity: 0, y: -20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
}

const bulletItem = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
}

export default function BulletSlide({ title, subtitle, points }: BulletSlideProps) {
  return (
    <div
      className="relative w-full h-full flex flex-col justify-center overflow-hidden"
      style={{ background: 'var(--color-bg, #0a0a0f)', padding: 'var(--slide-padding, 5rem)' }}
    >
      <motion.div
        className="flex flex-col gap-10"
        style={{ maxWidth: 'var(--content-max-width, 1400px)' }}
        variants={container}
        initial="hidden"
        animate="visible"
      >
        {/* Heading */}
        <div>
          <motion.h2
            className="slide-title"
            style={{
              fontSize: 'clamp(2rem, 4.5vw, 4rem)',
              color: 'var(--color-fg, #f0f0f5)',
              fontFamily: 'var(--font-heading)',
            }}
            variants={titleItem}
          >
            {title}
          </motion.h2>
          {subtitle && (
            <motion.p
              className="slide-subtitle mt-3"
              style={{ fontSize: 'clamp(0.9rem, 1.8vw, 1.5rem)' }}
              variants={titleItem}
            >
              {subtitle}
            </motion.p>
          )}
        </div>

        {/* Divider */}
        <motion.div
          className="w-16 h-0.5 rounded"
          style={{ background: 'var(--color-accent, #6366f1)' }}
          variants={titleItem}
        />

        {/* Bullets */}
        <ul className="flex flex-col gap-5">
          {points.map((point, i) => (
            <motion.li
              key={i}
              className="flex items-start gap-5"
              variants={bulletItem}
            >
              <span
                className="flex-shrink-0 mt-1 w-2 h-2 rounded-full"
                style={{ background: 'var(--color-accent, #6366f1)', marginTop: '0.5em' }}
              />
              <span
                style={{
                  fontSize: 'clamp(1rem, 2.2vw, 1.8rem)',
                  color: 'var(--color-fg, #f0f0f5)',
                  fontFamily: 'var(--font-body)',
                  lineHeight: 1.5,
                  opacity: 0.9,
                }}
              >
                {point}
              </span>
            </motion.li>
          ))}
        </ul>
      </motion.div>
    </div>
  )
}
