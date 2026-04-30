// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useKeyboardShortcuts } from '../../../src/renderer/lib/useKeyboardShortcuts'

function fireKey(opts: {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
}): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', {
    key: opts.key,
    metaKey: opts.metaKey ?? false,
    ctrlKey: opts.ctrlKey ?? false,
    bubbles: true,
    cancelable: true,
  })
  window.dispatchEvent(ev)
  return ev
}

describe('useKeyboardShortcuts', () => {
  it('Escape triggar escape-handler', () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts({ escape: handler }))
    fireKey({ key: 'Escape' })
    expect(handler).toHaveBeenCalledOnce()
  })

  it('mod+s (Cmd) triggar mod+s-handler', () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts({ 'mod+s': handler }))
    fireKey({ key: 's', metaKey: true })
    expect(handler).toHaveBeenCalledOnce()
  })

  it('mod+s (Ctrl) triggar mod+s-handler', () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts({ 'mod+s': handler }))
    fireKey({ key: 's', ctrlKey: true })
    expect(handler).toHaveBeenCalledOnce()
  })

  it('s utan modifier triggar inte mod+s', () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts({ 'mod+s': handler }))
    fireKey({ key: 's' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('mod+n triggar mod+n-handler', () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts({ 'mod+n': handler }))
    fireKey({ key: 'n', metaKey: true })
    expect(handler).toHaveBeenCalledOnce()
  })

  it('mod+k triggar mod+k-handler', () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts({ 'mod+k': handler }))
    fireKey({ key: 'k', metaKey: true })
    expect(handler).toHaveBeenCalledOnce()
  })

  it('case-insensitiv key-matching (S → s)', () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts({ 'mod+s': handler }))
    fireKey({ key: 'S', metaKey: true })
    expect(handler).toHaveBeenCalledOnce()
  })

  it('preventDefault på matchad shortcut', () => {
    renderHook(() => useKeyboardShortcuts({ escape: () => {} }))
    const ev = fireKey({ key: 'Escape' })
    expect(ev.defaultPrevented).toBe(true)
  })

  it('unmount tar bort listener (no-op vid efterföljande events)', () => {
    const handler = vi.fn()
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts({ escape: handler }),
    )
    unmount()
    fireKey({ key: 'Escape' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('shortcuts-objekt-byte tas i bruk via ref-uppdatering', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(
      ({ map }: { map: Record<string, () => void> }) =>
        useKeyboardShortcuts(map),
      { initialProps: { map: { escape: first } } },
    )
    rerender({ map: { escape: second } })
    fireKey({ key: 'Escape' })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
  })
})
