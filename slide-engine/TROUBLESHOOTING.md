# Troubleshooting

## Common Issues

### Deck doesn't appear in selector
- Verify folder exists: `src/decks/{name}/`
- Verify `manifest.ts` exports a valid `DeckManifest` object
- Verify `slides.ts` exports a valid `Slide[]` array
- Restart dev server (Vite glob imports are resolved at build time)

### Slide renders blank
- Check the slide's `type` matches a key in `LAYOUT_MAP`
- Check all required props are present (see SLIDE_TYPES.md)
- Check browser console for TypeScript errors

### Animations stutter
- Reduce Framer Motion complexity in the layout
- Ensure `layout` prop isn't on deeply nested elements
- Test in production build (`npm run build && npm run preview`)

### Tailwind classes not applying
- Tailwind v4 uses automatic content detection
- Ensure classes are complete strings (not dynamically constructed)
- `bg-${color}` will NOT work. Use complete class names.

### Fullscreen doesn't work
- Must be triggered by user gesture (keyboard shortcut)
- Some browsers block fullscreen in iframes

## Engine Development

### Adding a new slide type
1. Define the type in `src/engine/types.ts`
2. Create layout component in `src/layouts/`
3. Register in `LAYOUT_MAP` in `SlideRouter.tsx`
4. Document in `SLIDE_TYPES.md`
5. Add example in `src/decks/_template/slides.ts`

### Modifying navigation
- All keyboard handling lives in `KeyboardNav.tsx`
- SlideRouter manages the index state
- ProgressBar reads index and total from SlideRouter context
