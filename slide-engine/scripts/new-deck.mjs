#!/usr/bin/env node
import { cpSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const name = process.argv[2]

if (!name) {
  console.error('Usage: npm run new-deck <deck-name>')
  console.error('Example: npm run new-deck my-presentation')
  process.exit(1)
}

if (!/^[a-z0-9-]+$/.test(name)) {
  console.error('Deck name must be lowercase letters, numbers, and hyphens only.')
  process.exit(1)
}

const src = join(root, 'src', 'decks', '_template')
const dest = join(root, 'src', 'decks', name)

if (existsSync(dest)) {
  console.error(`Deck "${name}" already exists at src/decks/${name}/`)
  process.exit(1)
}

// Copy template
cpSync(src, dest, { recursive: true })

// Update manifest.ts — replace title and id
const manifestPath = join(dest, 'manifest.ts')
let manifest = readFileSync(manifestPath, 'utf8')

// Create a human-readable title from the deck name
const title = name
  .split('-')
  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  .join(' ')

manifest = manifest.replace("id: 'template'", `id: '${name}'`)
manifest = manifest.replace("title: 'Template Deck'", `title: '${title}'`)
manifest = manifest.replace(
  "description: 'A complete example deck showcasing all nine slide types.'",
  `description: 'Add a description for ${title}.'`
)

writeFileSync(manifestPath, manifest, 'utf8')

console.log(`\n✓ Created deck: "${title}"`)
console.log(`  Location: src/decks/${name}/\n`)
console.log('Next steps:')
console.log(`  1. Edit src/decks/${name}/manifest.ts — set title, author, date`)
console.log(`  2. Edit src/decks/${name}/slides.ts — write your slides`)
console.log('  3. npm run dev — to see your deck in the browser\n')
