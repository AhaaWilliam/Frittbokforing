import { useCallback, useEffect, useState } from 'react'
import { getHashParams, setHashParams } from './router'

function readFromUrl<T extends string>(
  key: string,
  allowedValues: readonly T[],
  defaultValue: T | undefined,
): T | undefined {
  const raw = getHashParams().get(key)
  if (raw == null) return defaultValue
  if ((allowedValues as readonly string[]).includes(raw)) return raw as T
  return defaultValue
}

function writeHashParams(entries: Record<string, string>): void {
  setHashParams(entries)
}

function currentParamsAsRecord(): Record<string, string> {
  const out: Record<string, string> = {}
  getHashParams().forEach((v, k) => {
    out[k] = v
  })
  return out
}

/**
 * URL-synkroniserat filter-state med whitelist-validering.
 *
 * - `allowedValues` är obligatorisk — värden utanför arrayen strippas från
 *   URL vid mount (håller URL ren, bevarar andra params).
 * - Skriver via `setHashParams` med `replaceState`, tar bort key vid
 *   `undefined` så URL inte växer med tomma params.
 * - Lyssnar på `hashchange` för extern sync (back/forward, programmatisk
 *   navigation).
 */
export function useFilterParam<T extends string>(
  key: string,
  allowedValues: readonly T[],
  defaultValue?: T,
): [T | undefined, (v: T | undefined) => void] {
  const [value, setValueState] = useState<T | undefined>(() =>
    readFromUrl(key, allowedValues, defaultValue),
  )

  useEffect(() => {
    const raw = getHashParams().get(key)
    if (raw != null && !(allowedValues as readonly string[]).includes(raw)) {
      const params = currentParamsAsRecord()
      delete params[key]
      writeHashParams(params)
    }
  }, [key, allowedValues])

  useEffect(() => {
    function onHashChange() {
      setValueState(readFromUrl(key, allowedValues, defaultValue))
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [key, allowedValues, defaultValue])

  const setValue = useCallback(
    (v: T | undefined) => {
      setValueState(v)
      const params = currentParamsAsRecord()
      if (v === undefined || v === defaultValue) {
        delete params[key]
      } else {
        params[key] = v
      }
      writeHashParams(params)
    },
    [key, defaultValue],
  )

  return [value, setValue]
}
