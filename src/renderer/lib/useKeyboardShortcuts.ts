import { useEffect, useRef } from 'react'

type ShortcutMap = Record<string, () => void>

export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  const shortcutsRef = useRef(shortcuts)
  shortcutsRef.current = shortcuts

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()

      if (key === 'escape' && shortcutsRef.current['escape']) {
        e.preventDefault()
        shortcutsRef.current['escape']()
        return
      }
      if (mod && key === 's' && shortcutsRef.current['mod+s']) {
        e.preventDefault()
        shortcutsRef.current['mod+s']()
        return
      }
      if (mod && key === 'n' && shortcutsRef.current['mod+n']) {
        e.preventDefault()
        shortcutsRef.current['mod+n']()
        return
      }
      if (mod && key === 'k' && shortcutsRef.current['mod+k']) {
        e.preventDefault()
        shortcutsRef.current['mod+k']()
        return
      }
      // mod+shift+b: mode-toggle (Vardag ↔ Bokförare). Använder e.shiftKey
      // istället för key 'b' eftersom shift+b på vissa layouter blir 'B'.
      if (mod && e.shiftKey && key === 'b' && shortcutsRef.current['mod+shift+b']) {
        e.preventDefault()
        shortcutsRef.current['mod+shift+b']()
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
