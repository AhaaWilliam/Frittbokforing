// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useIpcQuery, useDirectQuery } from '../../../src/renderer/lib/use-ipc-query'
import { IpcError } from '../../../src/renderer/lib/ipc-helpers'

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

describe('useIpcQuery', () => {
  it('unwrappar IpcResult vid success', async () => {
    const { result } = renderHook(
      () =>
        useIpcQuery(['key-1'], async () => ({
          success: true,
          data: { hello: 'world' },
        })),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ hello: 'world' })
  })

  it('error-state vid success: false', async () => {
    const { result } = renderHook(
      () =>
        useIpcQuery(['key-2'], async () => ({
          success: false,
          code: 'VALIDATION_ERROR',
          error: 'bad',
        })),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(IpcError)
    expect((result.current.error as IpcError).code).toBe('VALIDATION_ERROR')
  })

  it('respekterar enabled: false', () => {
    const { result } = renderHook(
      () =>
        useIpcQuery(
          ['key-3'],
          async () => ({ success: true, data: 1 }),
          { enabled: false },
        ),
      { wrapper: makeWrapper() },
    )
    // Med enabled=false ska queryn inte fetcha → status pending utan data
    expect(result.current.fetchStatus).toBe('idle')
    expect(result.current.data).toBeUndefined()
  })
})

describe('useDirectQuery', () => {
  it('returnerar data direkt utan unwrap', async () => {
    const { result } = renderHook(
      () => useDirectQuery(['direct-1'], async () => ({ count: 5 })),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ count: 5 })
  })

  it('inner-rejection ger error-state', async () => {
    const { result } = renderHook(
      () =>
        useDirectQuery(['direct-2'], async () => {
          throw new Error('boom')
        }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('boom')
  })
})
