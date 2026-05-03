/**
 * Sprint VS-150 — Vakt-test för mock-IPC-komplett täckning.
 *
 * Säkerställer att tests/setup/mock-ipc.ts methodToChannel-mappningen täcker
 * alla aktiva IPC-kanaler i src/shared/ipc-schemas.ts channelMap, plus de
 * dokumenterade NO_SCHEMA_CHANNELS. Förhindrar drift där nya IPC-kanaler
 * läggs till utan att mock-IPC uppdateras.
 *
 * När detta failar:
 *   - "Channels in channelMap missing from methodToChannel": lägg till en
 *     entry i methodToChannel med samma metodnamn som preload.ts exponerar.
 *   - "Channels in methodToChannel that don't exist": ta bort dead entry,
 *     eller (om kanal är legitim infrastruktur) lägg till i NO_SCHEMA_CHANNELS.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { channelMap } from '../src/shared/ipc-schemas'

// Mirror NO_SCHEMA_CHANNELS från tests/setup/mock-ipc.ts. Hardcoded här för
// att undvika circular import (mock-ipc importerar från vitest body).
const NO_SCHEMA_CHANNELS = [
  'db:health-check',
  'opening-balance:re-transfer',
  'backup:create',
  'backup:restore-dialog',
  'settings:get',
  'settings:set',
] as const

function extractMethodToChannelChannels(): Set<string> {
  const src = readFileSync(resolve(__dirname, 'setup/mock-ipc.ts'), 'utf8')
  const startIdx = src.indexOf('const methodToChannel')
  const endIdx = src.indexOf('\n}\n', startIdx)
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(
      'sprint-vs150: kunde inte lokalisera methodToChannel-block i mock-ipc.ts',
    )
  }
  const block = src.slice(startIdx, endIdx)
  const channels = new Set<string>()
  for (const m of block.matchAll(/:\s*'([a-z0-9-]+:[a-z0-9-]+)'/gi)) {
    channels.add(m[1]!)
  }
  return channels
}

describe('Sprint VS-150 — mock-IPC methodToChannel completeness', () => {
  const mappedChannels = extractMethodToChannelChannels()
  const channelMapKeys = new Set(Object.keys(channelMap))
  const noSchemaSet = new Set<string>(NO_SCHEMA_CHANNELS)

  it('every channel in channelMap is reachable via methodToChannel', () => {
    const missing = [...channelMapKeys]
      .filter((c) => !mappedChannels.has(c))
      .sort()
    expect(
      missing,
      `Channels in channelMap missing from methodToChannel:\n  - ${missing.join('\n  - ')}`,
    ).toEqual([])
  })

  it('every channel in methodToChannel exists in channelMap or NO_SCHEMA_CHANNELS', () => {
    const extras = [...mappedChannels]
      .filter((c) => !channelMapKeys.has(c) && !noSchemaSet.has(c))
      .sort()
    expect(
      extras,
      `Channels in methodToChannel that don't exist in channelMap or NO_SCHEMA_CHANNELS:\n  - ${extras.join('\n  - ')}`,
    ).toEqual([])
  })

  it('mock-IPC covers ALL channelMap channels (sanity)', () => {
    // Direkt size-check som sista safety-net.
    const totalChannelMap = channelMapKeys.size
    const coveredFromChannelMap = [...channelMapKeys].filter((c) =>
      mappedChannels.has(c),
    ).length
    expect(coveredFromChannelMap).toBe(totalChannelMap)
  })
})
