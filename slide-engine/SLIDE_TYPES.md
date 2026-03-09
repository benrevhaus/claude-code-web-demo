# Slide Type Catalog

## Type: `hero`

Full-viewport statement slide. Used for openers, closers, key moments.

```ts
{
  type: 'hero',
  title: string,
  subtitle?: string,
  accent?: string,        // override accent color for this slide
  notes?: string,         // presenter notes (not displayed on slide)
}
```

## Type: `section`

Section divider. Announces a new chapter.

```ts
{
  type: 'section',
  title: string,
  subtitle?: string,
  icon?: string,          // emoji or icon name
  notes?: string,
}
```

## Type: `bullet`

Heading with supporting points. The workhorse slide.

```ts
{
  type: 'bullet',
  title: string,
  subtitle?: string,
  points: string[],       // each string is one bullet
  notes?: string,
}
```

## Type: `comparison`

Side-by-side comparison. Two columns.

```ts
{
  type: 'comparison',
  title: string,
  left: { heading: string, points: string[] },
  right: { heading: string, points: string[] },
  notes?: string,
}
```

## Type: `diagram`

Custom visual. Accepts an array of layers rendered vertically.

```ts
{
  type: 'diagram',
  title?: string,
  layers: {
    icon?: string,
    label: string,
    description?: string,
    color?: string,
  }[],
  notes?: string,
}
```

## Type: `proof-point`

Highlight a result or metric with narrative context.

```ts
{
  type: 'proof-point',
  title: string,
  metric: string,         // the big number or callout ("3 hours")
  metricLabel: string,    // what the metric measures
  narrative: string,      // the story around it
  comparison?: string,    // optional "vs X" context
  notes?: string,
}
```

## Type: `icon-card`

Grid of cards, each with icon + label + description.

```ts
{
  type: 'icon-card',
  title?: string,
  cards: {
    icon: string,
    label: string,
    description: string,
  }[],
  columns?: 2 | 3 | 4,   // default: auto based on card count
  notes?: string,
}
```

## Type: `quote`

Featured callout text.

```ts
{
  type: 'quote',
  text: string,
  attribution?: string,
  notes?: string,
}
```

## Type: `timeline`

Sequential items on a visual timeline.

```ts
{
  type: 'timeline',
  title?: string,
  items: {
    label: string,
    description?: string,
    icon?: string,
  }[],
  notes?: string,
}
```
