// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useIpcMutation } from '../../../src/renderer/lib/use-ipc-mutation'
import { useIpcQuery } from '../../../src/renderer/lib/use-ipc-query'
import { IpcError } from '../../../src/renderer/lib/ipc-helpers'

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
  return { Wrapper, qc }
}

describe('useIpcMutation', () => {
  it('mutateAsync returnerar unwrappad data vid success', async () => {
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useIpcMutation<{ x: number }, { id: number }>(async (input) => ({
          success: true,
          data: { id: input.x * 2 },
        })),
      { wrapper: Wrapper },
    )
    const data = await result.current.mutateAsync({ x: 5 })
    expect(data).toEqual({ id: 10 })
  })

  it('mutateAsync kastar IpcError vid success: false', async () => {
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useIpcMutation<void, void>(async () => ({
          success: false,
          code: 'UNEXPECTED_ERROR',
          error: 'boom',
        })),
      { wrapper: Wrapper },
    )
    await expect(result.current.mutateAsync()).rejects.toBeInstanceOf(IpcError)
  })

  it('invalidate (statisk array) invaliderar specificerade query-keys', async () => {
    const { Wrapper, qc } = makeWrapper()
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ success: true, data: 1 })
      .mockResolvedValueOnce({ success: true, data: 2 })

    const { result } = renderHook(
      () => {
        const q = useIpcQuery(['list'], fetcher)
        const m = useIpcMutation<void, void>(
          async () => ({ success: true, data: undefined as unknown as void }),
          { invalidate: [['list']] },
        )
        return { q, m }
      },
      { wrapper: Wrapper },
    )
    await waitFor(() => expect(result.current.q.isSuccess).toBe(true))
    expect(result.current.q.data).toBe(1)

    await act(async () => {
      await result.current.m.mutateAsync()
    })
    // Efter invalidering refetchar useQuery → ny data
    await waitFor(() => expect(result.current.q.data).toBe(2))
    void qc
  })

  it('invalidate (funktion) får data + input som argument', async () => {
    const { Wrapper } = makeWrapper()
    const invalidateFn = vi.fn().mockReturnValue([['some-key', 99]])
    const { result } = renderHook(
      () =>
        useIpcMutation<{ id: number }, { ok: boolean }>(
          async (input) => ({
            success: true,
            data: { ok: input.id > 0 },
          }),
          { invalidate: invalidateFn },
        ),
      { wrapper: Wrapper },
    )
    await act(async () => {
      await result.current.mutateAsync({ id: 7 })
    })
    expect(invalidateFn).toHaveBeenCalledWith({ ok: true }, { id: 7 })
  })

  it('invalidateAll invaliderar hela cachen', async () => {
    const { Wrapper, qc } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(
      () =>
        useIpcMutation<void, void>(
          async () => ({ success: true, data: undefined as unknown as void }),
          { invalidateAll: true },
        ),
      { wrapper: Wrapper },
    )
    await act(async () => {
      await result.current.mutateAsync()
    })
    // invalidateAll → invalidateQueries() utan argument
    expect(spy).toHaveBeenCalledWith()
  })

  it('onSuccess-callback körs efter invalidering', async () => {
    const { Wrapper } = makeWrapper()
    const onSuccess = vi.fn()
    const { result } = renderHook(
      () =>
        useIpcMutation<{ x: number }, { y: number }>(
          async (input) => ({ success: true, data: { y: input.x + 1 } }),
          { onSuccess },
        ),
      { wrapper: Wrapper },
    )
    await act(async () => {
      await result.current.mutateAsync({ x: 4 })
    })
    expect(onSuccess).toHaveBeenCalledWith({ y: 5 }, { x: 4 })
  })
})
