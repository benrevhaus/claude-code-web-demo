import type { DeckManifest } from '../../engine/types'

const manifest: DeckManifest = {
  // Unique identifier for the deck (used internally)
  id: 'template',

  // Display title shown in the deck selector
  title: 'Template Deck',

  // Optional author name
  author: 'Your Name',

  // Optional date (freeform string, e.g. "Q1 2025" or "March 2025")
  date: 'March 2025',

  // Optional short description shown in the deck selector
  description: 'A complete example deck showcasing all nine slide types.',

  // Optional theme overrides — any token can be overridden
  // theme: {
  //   colors: {
  //     accent: '#10b981',  // override accent to emerald
  //   },
  // },
}

export default manifest
