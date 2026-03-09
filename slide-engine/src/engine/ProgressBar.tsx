import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

interface ProgressBarProps {
  current: number
  total: number
}

export default function ProgressBar({ current, total }: ProgressBarProps) {
  const [visible, setVisible] = useState(true)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevCurrentRef = useRef(current)

  useEffect(() => {
    if (prevCurrentRef.current !== current) {
      prevCurrentRef.current = current
      setVisible(true)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      hideTimerRef.current = setTimeout(() => setVisible(false), 2000)
    }
  }, [current])

  useEffect(() => {
    hideTimerRef.current = setTimeout(() => setVisible(false), 2000)
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [])

  const progress = total <= 1 ? 1 : current / (total - 1)

  return (
    <motion.div
      className="fixed bottom-0 left-0 right-0 z-50 h-1"
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="w-full h-full bg-white/10">
        <motion.div
          className="h-full"
          style={{ background: 'var(--color-accent, #6366f1)' }}
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
        />
      </div>
    </motion.div>
  )
}
