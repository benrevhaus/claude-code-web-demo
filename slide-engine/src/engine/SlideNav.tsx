import { motion } from 'framer-motion'
import type { Slide } from './types'

interface SlideNavProps {
  slides: Slide[]
  current: number
  onSelect: (index: number) => void
}

export default function SlideNav({ slides, current, onSelect }: SlideNavProps) {
  return (
    <motion.div
      className="fixed left-0 top-0 bottom-0 z-40 w-52 overflow-y-auto py-4 px-3"
      initial={{ x: '-100%' }}
      animate={{ x: 0 }}
      exit={{ x: '-100%' }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      style={{
        background: 'rgba(10, 10, 15, 0.95)',
        backdropFilter: 'blur(12px)',
        borderRight: '1px solid var(--color-border, #2a2a3e)',
      }}
    >
      <p
        className="text-xs font-semibold uppercase tracking-widest mb-3 px-1"
        style={{ color: 'var(--color-accent, #6366f1)' }}
      >
        Slides
      </p>
      <div className="flex flex-col gap-1">
        {slides.map((slide, i) => {
          const isActive = i === current
          const title = 'title' in slide ? slide.title : 'text' in slide ? slide.text.slice(0, 30) + '…' : `Slide ${i + 1}`
          return (
            <button
              key={i}
              onClick={() => onSelect(i)}
              className="text-left w-full rounded-lg px-3 py-2 text-xs transition-colors"
              style={{
                background: isActive ? 'var(--color-accent, #6366f1)' : 'transparent',
                color: isActive ? '#fff' : 'var(--color-muted, #9ca3af)',
              }}
            >
              <span className="opacity-50 mr-1.5">{i + 1}.</span>
              <span className="font-medium capitalize">{slide.type}</span>
              <span className="block truncate opacity-70 mt-0.5">{title}</span>
            </button>
          )
        })}
      </div>
    </motion.div>
  )
}
