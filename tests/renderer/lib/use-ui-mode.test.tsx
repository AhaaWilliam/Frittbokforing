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
})
