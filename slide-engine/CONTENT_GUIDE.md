# Content Guide: Writing Slides for the Engine

## Seed Document → Slides Workflow

1. Write or paste your raw content (memo, doc, outline) into the conversation
2. Tell Claude which deck to target
3. Claude converts the content into typed slide objects in `slides.ts`

## Conversion Principles

### Hierarchy Mapping
- H1 headings → `section` slides
- H2 with a single strong statement → `hero` slides
- H2 with bullet points → `bullet` slides
- Comparisons or either/or → `comparison` slides
- Metrics or results → `proof-point` slides
- Role descriptions or categories → `icon-card` slides
- ASCII art or diagrams → `diagram` slides with typed layers
- Key quotes or callouts → `quote` slides

### Content Rules
- Max 5 bullet points per `bullet` slide. Split if more.
- Bullet text should be ≤ 15 words each. Tighten prose.
- One idea per slide. If a section has two ideas, it's two slides.
- Presenter notes capture detail that doesn't belong on screen.
- Every slide must have a `notes` field, even if empty string.

### Ordering
- Open with a `hero` slide (the thesis)
- Group related slides under `section` dividers
- End with a `hero` slide (the call to action)

### Theme Overrides
- If a deck has a specific brand, set colors in `manifest.ts`
- Individual slides can override accent color via `accent` field

## Example: Converting a Paragraph

**Source text:**
> Most companies lose knowledge constantly. It lives in people's heads,
> Slack threads, and undocumented systems.

**Becomes:**
```ts
{
  type: 'quote',
  text: "Most companies lose knowledge constantly.",
  notes: "Expand on this: lives in heads, Slack threads, undocumented systems. This is the pain point setup before introducing seeds."
}
```
