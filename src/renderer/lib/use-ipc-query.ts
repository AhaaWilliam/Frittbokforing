import { useQuery } from '@tanstack/react-query'
import type { UseQueryOptions } from '@tanstack/react-query'
import type { IpcResult } from '../../shared/types'
import { ipcCall } from './ipc-helpers'

/**
 * Wrapper runt useQuery som automatiskt unwrappar IpcResult<T> via ipcCall.
 *
 * Används för window.api-metoder som returnerar IpcResult<T>.
 * ipcCall kastar vid success: false → TanStack Query error state.
 */
export function useIpcQuery<T>(
  queryKey: readonly unknown[],
  queryFn: () => Promise<IpcResult<T>>,
  options?: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<T>({
    queryKey,
    queryFn: () => ipcCall<T>(queryFn),
    ...options,
  })
}

/**
 * Wrapper runt useQuery för window.api-metoder som returnerar data direkt
 * (inte wrappat i IpcResult).
 *
 * Dessa är typiskt read-only listor och lookups som preload
 * returnerar direkt utan IpcResult-wrapper.
 */
export function useDirectQuery<T>(
  queryKey: readonly unknown[],
  queryFn: () => Promise<T>,
  options?: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<T>({
    queryKey,
    queryFn,
    ...options,
  })
}
