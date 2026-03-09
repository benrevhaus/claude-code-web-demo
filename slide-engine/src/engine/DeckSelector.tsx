import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import type { LoadedDeck, DeckManifest } from './types'
import type { Slide } from './types'

interface DeckSelectorProps {
  onSelect: (deck: LoadedDeck) => void
}

interface DeckEntry {
  manifest: DeckManifest
  slides: Slide[]
  path: string
}

export default function DeckSelector({ onSelect }: DeckSelectorProps) {
  const [decks, setDecks] = useState<DeckEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadDecks() {
      // Use Vite's glob import to discover all deck manifests
      const manifestModules = import.meta.glob('../decks/*/manifest.ts') as Record<
        string,
        () => Promise<{ default: DeckManifest }>
      >
      const slidesModules = import.meta.glob('../decks/*/slides.ts') as Record<
        string,
        () => Promise<{ default: Slide[] }>
      >

      const results: DeckEntry[] = []

      for (const [manifestPath, loadManifest] of Object.entries(manifestModules)) {
        // Skip the _template deck
        if (manifestPath.includes('/_template/')) continue

        const deckDir = manifestPath.replace('/manifest.ts', '')
        const slidesPath = `${deckDir}/slides.ts`

        if (!slidesModules[slidesPath]) continue

        try {
          const [manifestMod, slidesMod] = await Promise.all([
            loadManifest(),
            slidesModules[slidesPath](),
          ])
          results.push({
            manifest: manifestMod.default,
            slides: slidesMod.default,
            path: deckDir,
          })
        } catch (err) {
          console.warn(`Failed to load deck at ${manifestPath}:`, err)
        }
      }

      // Sort by title
      results.sort((a, b) => a.manifest.title.localeCompare(b.manifest.title))
      setDecks(results)
      setLoading(false)
    }

    loadDecks()
  }, [])

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08, delayChildren: 0.1 },
    },
  }

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
  }

  return (
    <div
      className="w-full h-full overflow-auto flex flex-col"
      style={{ background: 'var(--color-bg, #0a0a0f)' }}
    >
      {/* Header */}
      <div className="flex-shrink-0 px-16 pt-16 pb-10">
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1
            className="text-4xl font-extrabold tracking-tight mb-2"
            style={{ color: 'var(--color-fg, #f0f0f5)', fontFamily: 'var(--font-heading)' }}
          >
            Slide Engine
          </h1>
          <p className="text-lg" style={{ color: 'var(--color-muted, #9ca3af)' }}>
            Select a deck to present
          </p>
        </motion.div>
      </div>

      {/* Deck Grid */}
      <div className="flex-1 px-16 pb-16">
        {loading && (
          <p style={{ color: 'var(--color-muted)' }} className="text-base">
            Loading decks…
          </p>
        )}

        {!loading && decks.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center h-64 gap-4"
          >
            <p
              className="text-xl font-medium"
              style={{ color: 'var(--color-muted, #9ca3af)' }}
            >
              No decks found
            </p>
            <p className="text-sm" style={{ color: 'var(--color-muted, #9ca3af)', opacity: 0.6 }}>
              Run{' '}
              <code
                className="px-2 py-0.5 rounded text-xs"
                style={{
                  background: 'var(--color-subtle)',
                  color: 'var(--color-accent)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                npm run new-deck my-deck
              </code>{' '}
              to create your first deck.
            </p>
          </motion.div>
        )}

        {!loading && decks.length > 0 && (
          <motion.div
            className="grid gap-5"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {decks.map((deck) => (
              <motion.button
                key={deck.manifest.id}
                variants={cardVariants}
                onClick={() =>
                  onSelect({
                    manifest: deck.manifest,
                    slides: deck.slides,
                    slideCount: deck.slides.length,
                  })
                }
                className="text-left rounded-2xl p-7 transition-colors group"
                style={{
                  background: 'var(--color-card-bg, #13131f)',
                  border: '1px solid var(--color-border, #2a2a3e)',
                }}
                whileHover={{
                  borderColor: 'var(--color-accent)',
                  scale: 1.01,
                }}
                whileTap={{ scale: 0.99 }}
              >
                {/* Slide count badge */}
                <div className="flex items-center justify-between mb-5">
                  <span
                    className="text-xs font-semibold uppercase tracking-widest px-2.5 py-1 rounded-full"
                    style={{
                      background: 'rgba(99, 102, 241, 0.15)',
                      color: 'var(--color-accent, #6366f1)',
                    }}
                  >
                    {deck.slides.length} slides
                  </span>
                </div>

                {/* Title */}
                <h2
                  className="text-xl font-bold mb-2 leading-snug"
                  style={{
                    color: 'var(--color-fg, #f0f0f5)',
                    fontFamily: 'var(--font-heading)',
                  }}
                >
                  {deck.manifest.title}
                </h2>

                {/* Description */}
                {deck.manifest.description && (
                  <p
                    className="text-sm mb-4 line-clamp-2"
                    style={{ color: 'var(--color-muted, #9ca3af)' }}
                  >
                    {deck.manifest.description}
                  </p>
                )}

                {/* Meta */}
                <div
                  className="flex items-center gap-3 text-xs"
                  style={{ color: 'var(--color-muted, #9ca3af)', opacity: 0.6 }}
                >
                  {deck.manifest.author && <span>{deck.manifest.author}</span>}
                  {deck.manifest.author && deck.manifest.date && <span>·</span>}
                  {deck.manifest.date && <span>{deck.manifest.date}</span>}
                </div>
              </motion.button>
            ))}
          </motion.div>
        )}
      </div>

      {/* Footer */}
      <div
        className="flex-shrink-0 px-16 py-4 text-xs border-t flex items-center gap-6"
        style={{
          borderColor: 'var(--color-border, #2a2a3e)',
          color: 'var(--color-muted, #9ca3af)',
          opacity: 0.5,
        }}
      >
        <span>← → Navigate</span>
        <span>Space / Enter Forward</span>
        <span>Esc Back to selector</span>
        <span>F Fullscreen</span>
        <span>N Notes</span>
        <span>G Go to slide</span>
      </div>
    </div>
  )
}
