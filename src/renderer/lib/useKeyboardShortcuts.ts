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
      // mod+enter: submit-shortcut för transactional formulär (sheets m.fl.)
      if (mod && key === 'enter' && shortcutsRef.current['mod+enter']) {
        e.preventDefault()
        shortcutsRef.current['mod+enter']()
        return
      }
      if (mod && key === 'n' && shortcutsRef.current['mod+n']) {
        e.preventDefault()
        shortcutsRef.current['mod+n']()
        return
      }
      // mod+i: skapa ny inkomst/faktura (Vardag-läget)
      if (mod && key === 'i' && shortcutsRef.current['mod+i']) {
        e.preventDefault()
        shortcutsRef.current['mod+i']()
        return
      }
      if (mod && key === 'k' && shortcutsRef.current['mod+k']) {
        e.preventDefault()
        shortcutsRef.current['mod+k']()
        return
      }
      // '/': fokusera list-search på sidor med egen sök-ruta. Skippas när
      // användaren redan skriver i input/textarea/contenteditable, så att
      // tecknet kommer fram normalt. Undviker mod+k-konflikt med
      // GlobalSearch + CommandPalette (VS-104).
      if (key === '/' && !mod && !e.shiftKey && shortcutsRef.current['/']) {
        const target = e.target as HTMLElement | null
        const tag = target?.tagName
        const isTyping =
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target?.isContentEditable === true
        if (!isTyping) {
          e.preventDefault()
          shortcutsRef.current['/']()
        }
        return
      }
      // mod+shift+b: mode-toggle (Vardag ↔ Bokförare). Använder e.shiftKey
      // istället för key 'b' eftersom shift+b på vissa layouter blir 'B'.
      if (
        mod &&
        e.shiftKey &&
        key === 'b' &&
        shortcutsRef.current['mod+shift+b']
      ) {
        e.preventDefault()
        shortcutsRef.current['mod+shift+b']()
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
