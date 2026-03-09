import { motion } from 'framer-motion'

interface PresenterNotesProps {
  notes: string
  current: number
  total: number
}

export default function PresenterNotes({ notes, current, total }: PresenterNotesProps) {
  return (
    <motion.div
      className="fixed bottom-0 left-0 right-0 z-40"
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
    >
      <div
        className="mx-4 mb-4 rounded-xl p-5 backdrop-blur-xl"
        style={{
          background: 'rgba(19, 19, 31, 0.95)',
          border: '1px solid var(--color-border, #2a2a3e)',
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <span
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--color-accent, #6366f1)' }}
          >
            Presenter Notes
          </span>
          <span className="text-xs" style={{ color: 'var(--color-muted, #9ca3af)' }}>
            {current + 1} / {total}
          </span>
        </div>
        <p
          className="text-sm leading-relaxed"
          style={{ color: 'var(--color-fg, #f0f0f5)', opacity: 0.85 }}
        >
          {notes || <em style={{ color: 'var(--color-muted)' }}>No notes for this slide.</em>}
        </p>
      </div>
    </motion.div>
  )
}
