import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationOptions } from '@tanstack/react-query'
import type { IpcResult } from '../../shared/types'
import { ipcCall } from './ipc-helpers'

type InvalidateKeys = readonly (readonly unknown[])[]

interface UseIpcMutationOptions<TInput, TOutput> {
  /**
   * QueryKeys att invalidera vid success. Tom array = ingen invalidering.
   *
   * Statisk form: `readonly (readonly unknown[])[]` — lista av keys.
   * Dynamisk form: `(data, input) => readonly (readonly unknown[])[]` —
   * funktion som får mutationens output + input och returnerar listan.
   * Använd dynamisk form när key beror på input (t.ex. `fixedAsset(input.id)`).
   */
  invalidate?:
    | InvalidateKeys
    | ((data: TOutput, input: TInput) => InvalidateKeys)
  /** Invalidera ALL cache (för mutations som påverkar allt, t.ex. switchFiscalYear). */
  invalidateAll?: boolean
  /** Callback efter lyckad mutation + invalidering. */
  onSuccess?: (data: TOutput, input: TInput) => void
  /** Extra TanStack Query options. */
  queryOptions?: Omit<
    UseMutationOptions<TOutput, Error, TInput>,
    'mutationFn' | 'onSuccess'
  >
}

/**
 * Wrapper runt useMutation som:
 * 1. Unwrappar IpcResult<T> via ipcCall
 * 2. Invaliderar specificerade queryKeys vid success
 * 3. Awaitar invalidering INNAN onSuccess anropas (race condition guard)
 *
 * Global onError (toast) hanteras redan i QueryClient config.
 */
export function useIpcMutation<TInput, TOutput = void>(
  mutationFn: (input: TInput) => Promise<IpcResult<TOutput>>,
  options?: UseIpcMutationOptions<TInput, TOutput>,
) {
  const queryClient = useQueryClient()

  return useMutation<TOutput, Error, TInput>({
    mutationFn: (input) => ipcCall<TOutput>(() => mutationFn(input)),
    onSuccess: async (data, input) => {
      if (options?.invalidateAll) {
        await queryClient.invalidateQueries()
      } else if (options?.invalidate) {
        const keys =
          typeof options.invalidate === 'function'
            ? options.invalidate(data, input)
            : options.invalidate
        await Promise.all(
          keys.map((key) =>
            queryClient.invalidateQueries({ queryKey: [...key] }),
          ),
        )
      }
      options?.onSuccess?.(data, input)
    },
    ...options?.queryOptions,
  })
}
