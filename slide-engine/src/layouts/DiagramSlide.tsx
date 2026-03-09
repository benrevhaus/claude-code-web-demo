import { motion } from 'framer-motion'
import type { DiagramSlideProps } from '../engine/types'

const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.12, delayChildren: 0.15 } },
}

const layerItem = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
}

export default function DiagramSlide({ title, layers }: DiagramSlideProps) {
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
        className="flex flex-col gap-3"
        variants={container}
        initial="hidden"
        animate="visible"
      >
        {layers.map((layer, i) => {
          const layerColor = layer.color ?? 'var(--color-accent, #6366f1)'
          return (
            <motion.div
              key={i}
              className="flex items-center gap-6 rounded-xl px-7 py-5"
              style={{
                background: 'var(--color-card-bg, #13131f)',
                border: `1px solid ${layerColor}40`,
                borderLeft: `3px solid ${layerColor}`,
              }}
              variants={layerItem}
            >
              {layer.icon && (
                <span className="text-3xl flex-shrink-0">{layer.icon}</span>
              )}
              <div className="flex-1">
                <p
                  className="font-semibold"
                  style={{
                    fontSize: 'clamp(0.9rem, 2vw, 1.6rem)',
                    color: 'var(--color-fg, #f0f0f5)',
                    fontFamily: 'var(--font-heading)',
                  }}
                >
                  {layer.label}
                </p>
                {layer.description && (
                  <p
                    className="mt-1 opacity-70"
                    style={{
                      fontSize: 'clamp(0.75rem, 1.4vw, 1.2rem)',
                      color: 'var(--color-muted, #9ca3af)',
                    }}
                  >
                    {layer.description}
                  </p>
                )}
              </div>
              {/* Layer index */}
              <div
                className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: `${layerColor}20`, color: layerColor }}
              >
                {i + 1}
              </div>
            </motion.div>
          )
        })}
      </motion.div>
    </div>
  )
}
