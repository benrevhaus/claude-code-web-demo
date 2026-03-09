import { useEffect, useRef, useCallback } from 'react'

interface KeyboardNavOptions {
  onNext: () => void
  onPrev: () => void
  onExit: () => void
  onToggleFullscreen: () => void
  onToggleNotes: () => void
  onGoToSlide: (index: number) => void
  onFirst: () => void
  onLast: () => void
  total: number
}

export function useKeyboardNav(options: KeyboardNavOptions) {
  const { onNext, onPrev, onExit, onToggleFullscreen, onToggleNotes, onGoToSlide, onFirst, onLast, total } = options
  const goToBufferRef = useRef<string>('')
  const goToModeRef = useRef(false)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't intercept when typing in inputs
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

    if (goToModeRef.current) {
      if (e.key === 'Enter') {
        const num = parseInt(goToBufferRef.current, 10)
        if (!isNaN(num) && num >= 1 && num <= total) {
          onGoToSlide(num - 1)
        }
        goToModeRef.current = false
        goToBufferRef.current = ''
        return
      }
      if (e.key === 'Escape') {
        goToModeRef.current = false
        goToBufferRef.current = ''
        return
      }
      if (/^\d$/.test(e.key)) {
        goToBufferRef.current += e.key
        return
      }
    }

    switch (e.key) {
      case 'ArrowRight':
      case ' ':
      case 'Enter':
        e.preventDefault()
        onNext()
        break
      case 'ArrowLeft':
        e.preventDefault()
        onPrev()
        break
      case 'Escape':
        e.preventDefault()
        onExit()
        break
      case 'f':
      case 'F':
        e.preventDefault()
        onToggleFullscreen()
        break
      case 'n':
      case 'N':
        e.preventDefault()
        onToggleNotes()
        break
      case 'g':
      case 'G':
        e.preventDefault()
        goToModeRef.current = true
        goToBufferRef.current = ''
        break
      case 'Home':
        e.preventDefault()
        onFirst()
        break
      case 'End':
        e.preventDefault()
        onLast()
        break
    }
  }, [onNext, onPrev, onExit, onToggleFullscreen, onToggleNotes, onGoToSlide, onFirst, onLast, total])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
