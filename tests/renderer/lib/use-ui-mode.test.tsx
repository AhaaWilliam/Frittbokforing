// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useUiMode } from '../../../src/renderer/lib/use-ui-mode'

describe('useUiMode', () => {
  let getSettingMock: ReturnType<typeof vi.fn>
  let setSettingMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    getSettingMock = vi.fn().mockResolvedValue(null)
    setSettingMock = vi.fn().mockResolvedValue(undefined)
    // Mutera bara window.api — replacement av hela window-objektet bryter
    // react-dom (saknar HTMLElement-prototypen).
    ;(window as unknown as { api: unknown }).api = {
      getSetting: getSettingMock,
      setSetting: setSettingMock,
    }
    document.documentElement.removeAttribute('data-mode')
  })

  afterEach(() => {
    document.documentElement.removeAttribute('data-mode')
    delete (window as unknown as { api?: unknown }).api
  })

  it('starts with DEFAULT_MODE (bokforare) and loading=true', () => {
    const { result } = renderHook(() => useUiMode())
    expect(result.current.mode).toBe('bokforare')
    expect(result.current.loading).toBe(true)
  })

  it('reads persisted mode from settings', async () => {
    getSettingMock.mockResolvedValue('vardag')
    const { result } = renderHook(() => useUiMode())
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(result.current.mode).toBe('vardag')
    expect(document.documentElement.dataset.mode).toBe('vardag')
  })

  it('falls back to default when settings returns invalid value', async () => {
    getSettingMock.mockResolvedValue('invalid-mode')
    const { result } = renderHook(() => useUiMode())
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(result.current.mode).toBe('bokforare')
  })

  it('falls back to default when settings throws', async () => {
    getSettingMock.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useUiMode())
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(result.current.mode).toBe('bokforare')
  })

  it('setMode updates state, persists, and sets data-mode', async () => {
    const { result } = renderHook(() => useUiMode())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.setMode('vardag')
    })

    expect(result.current.mode).toBe('vardag')
    expect(document.documentElement.dataset.mode).toBe('vardag')
    expect(setSettingMock).toHaveBeenCalledWith('ui_mode', 'vardag')
  })

  it('setMode swallows persistence errors', async () => {
    setSettingMock.mockRejectedValue(new Error('disk full'))
    const { result } = renderHook(() => useUiMode())
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Should not throw
    expect(() => {
      act(() => {
        result.current.setMode('vardag')
      })
    }).not.toThrow()
    expect(result.current.mode).toBe('vardag')
  })

  it('only triggers initial settings-read once', async () => {
    const { rerender } = renderHook(() => useUiMode())
    await waitFor(() => expect(getSettingMock).toHaveBeenCalledTimes(1))
    rerender()
    rerender()
    expect(getSettingMock).toHaveBeenCalledTimes(1)
  })

  it('setMode broadcastar till andra useUiMode-instanser (cross-instance sync)', async () => {
    // Bug-regression: ModeRouter och AppShellInner är separata useUiMode-
    // instanser. Innan fixen uppdaterade setMode bara den anropande
    // instansen — andra (t.ex. ModeRouter) plockade inte upp ändringen
    // → vy-byte fungerade inte.
    const hookA = renderHook(() => useUiMode())
    const hookB = renderHook(() => useUiMode())
    await waitFor(() => expect(hookA.result.current.loading).toBe(false))
    await waitFor(() => expect(hookB.result.current.loading).toBe(false))

    expect(hookA.result.current.mode).toBe('bokforare')
    expect(hookB.result.current.mode).toBe('bokforare')

    act(() => {
      hookA.result.current.setMode('vardag')
    })

    expect(hookA.result.current.mode).toBe('vardag')
    expect(hookB.result.current.mode).toBe('vardag') // synkad via broadcast
    expect(document.documentElement.dataset.mode).toBe('vardag')
  })

  it('cleanup tar bort event-listener vid unmount', async () => {
    const hookA = renderHook(() => useUiMode())
    const hookB = renderHook(() => useUiMode())
    await waitFor(() => expect(hookA.result.current.loading).toBe(false))
    await waitFor(() => expect(hookB.result.current.loading).toBe(false))

    hookB.unmount()

    act(() => {
      hookA.result.current.setMode('vardag')
    })
    // hookA uppdateras, hookB är unmountad — ingen krasch
    expect(hookA.result.current.mode).toBe('vardag')
  })
})
