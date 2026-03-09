import { useState, useMemo } from 'react'
import { defaultTheme, mergeTheme, themeToVars } from './theme'
import type { LoadedDeck } from './engine/types'
import DeckSelector from './engine/DeckSelector'
import SlideRouter from './engine/SlideRouter'

export default function App() {
  const [activeDeck, setActiveDeck] = useState<LoadedDeck | null>(null)

  const theme = useMemo(() => {
    if (!activeDeck) return defaultTheme
    return mergeTheme(defaultTheme, activeDeck.manifest.theme)
  }, [activeDeck])

  const cssVars = useMemo(() => themeToVars(theme), [theme])

  return (
    <div
      style={cssVars as React.CSSProperties}
      className="w-full h-full"
    >
      {activeDeck === null ? (
        <DeckSelector onSelect={setActiveDeck} />
      ) : (
        <SlideRouter
          deck={activeDeck}
          theme={theme}
          onExit={() => setActiveDeck(null)}
        />
      )}
    </div>
  )
}
