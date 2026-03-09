import { useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { LoadedDeck, ThemeTokens } from './types'
import type { ComponentType } from 'react'
import type { Slide, SlideType } from './types'
import { useKeyboardNav } from './KeyboardNav'
import ProgressBar from './ProgressBar'
import PresenterNotes from './PresenterNotes'
import SlideNav from './SlideNav'

// Layout imports
import HeroSlide from '../layouts/HeroSlide'
import SectionSlide from '../layouts/SectionSlide'
import BulletSlide from '../layouts/BulletSlide'
import ComparisonSlide from '../layouts/ComparisonSlide'
import DiagramSlide from '../layouts/DiagramSlide'
import ProofPointSlide from '../layouts/ProofPointSlide'
import IconCardSlide from '../layouts/IconCardSlide'
import QuoteSlide from '../layouts/QuoteSlide'
import TimelineSlide from '../layouts/TimelineSlide'
import SeedDocSlide from '../layouts/SeedDocSlide'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LAYOUT_MAP: Record<SlideType, ComponentType<any>> = {
  hero: HeroSlide,
  section: SectionSlide,
  bullet: BulletSlide,
  comparison: ComparisonSlide,
  diagram: DiagramSlide,
  'proof-point': ProofPointSlide,
  'icon-card': IconCardSlide,
  quote: QuoteSlide,
  timeline: TimelineSlide,
  'seed-doc': SeedDocSlide,
}

interface SlideRouterProps {
  deck: LoadedDeck
  theme: ThemeTokens
  onExit: () => void
}

export default function SlideRouter({ deck, onExit }: SlideRouterProps) {
  const [current, setCurrent] = useState(0)
  const [showNotes, setShowNotes] = useState(false)
  const [showNav, setShowNav] = useState(false)
  const total = deck.slides.length

  const goNext = useCallback(() => setCurrent((c) => Math.min(c + 1, total - 1)), [total])
  const goPrev = useCallback(() => setCurrent((c) => Math.max(c - 1, 0)), [])
  const goToSlide = useCallback((index: number) => setCurrent(index), [])
  const goFirst = useCallback(() => setCurrent(0), [])
  const goLast = useCallback(() => setCurrent(total - 1), [total])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }, [])

  const toggleNotes = useCallback(() => setShowNotes((s) => !s), [])

  useKeyboardNav({
    onNext: goNext,
    onPrev: goPrev,
    onExit,
    onToggleFullscreen: toggleFullscreen,
    onToggleNotes: toggleNotes,
    onGoToSlide: goToSlide,
    onFirst: goFirst,
    onLast: goLast,
    total,
  })

  const slide = deck.slides[current]
  const Layout = LAYOUT_MAP[slide.type]

  return (
    <div
      className="slide-viewport relative"
      style={{ background: 'var(--color-bg, #0a0a0f)' }}
      onClick={goNext}
    >
      {/* Slide strip toggle */}
      <button
        className="fixed top-3 left-3 z-50 w-8 h-8 rounded-lg flex items-center justify-center transition-opacity opacity-0 hover:opacity-100"
        style={{
          background: 'rgba(255,255,255,0.08)',
          color: 'var(--color-muted)',
        }}
        onClick={(e) => {
          e.stopPropagation()
          setShowNav((s) => !s)
        }}
        title="Toggle slide panel"
      >
        ☰
      </button>

      {/* Slide frame */}
      <div className="slide-frame">
        <div className="grain-overlay" />
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={(e) => e.stopPropagation()}
          >
            <Layout {...(slide as Slide)} />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Progress bar */}
      <ProgressBar current={current} total={total} />

      {/* Presenter notes */}
      <AnimatePresence>
        {showNotes && (
          <PresenterNotes
            notes={slide.notes ?? ''}
            current={current}
            total={total}
          />
        )}
      </AnimatePresence>

      {/* Slide nav strip */}
      <AnimatePresence>
        {showNav && (
          <SlideNav
            slides={deck.slides}
            current={current}
            onSelect={(i) => {
              goToSlide(i)
              setShowNav(false)
            }}
          />
        )}
      </AnimatePresence>

      {/* Slide counter (bottom-right) */}
      <div
        className="fixed bottom-4 right-6 z-40 text-sm tabular-nums"
        style={{ color: 'var(--color-muted, #9ca3af)', opacity: 0.4 }}
      >
        {current + 1} / {total}
      </div>
    </div>
  )
}
