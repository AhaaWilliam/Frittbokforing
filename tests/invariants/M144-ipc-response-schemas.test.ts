import { describe, it, expect } from 'vitest'
import { channelResponseMap } from '../../src/shared/ipc-response-schemas'
import { channelMap } from '../../src/shared/ipc-schemas'

/**
 * M144 — IpcResult-mandat för affärsdata-kanaler.
 *
 * Alla IPC-kanaler som returnerar affärsdata ska ha ett response-schema
 * registrerat i channelResponseMap. Undantag: infrastruktur-kanaler
 * (health-check, settings, backup) via NO_SCHEMA_CHANNELS-whitelist.
 */

const NO_SCHEMA_CHANNELS = [
  'db:health-check',
  'opening-balance:re-transfer',
  'backup:create',
  'backup:restore-dialog',
  'settings:get',
  'settings:set',
]

describe('M144 — IPC response-schemas täcker alla affärsdata-kanaler', () => {
  it('Varje input-channel har response-schema (minus NO_SCHEMA_CHANNELS)', () => {
    const inputChannels = Object.keys(channelMap)
    const responseChannels = Object.keys(channelResponseMap)

    const missing = inputChannels.filter(
      (ch) =>
        !responseChannels.includes(ch) && !NO_SCHEMA_CHANNELS.includes(ch),
    )
    expect(missing).toEqual([])
  })

  it('Inga response-schemas för kanaler utanför input-schemas', () => {
    const inputChannels = Object.keys(channelMap)
    const responseChannels = Object.keys(channelResponseMap)

    const orphan = responseChannels.filter(
      (ch) => !inputChannels.includes(ch),
    )
    expect(orphan).toEqual([])
  })

  it('Varje response-schema är ett zod-schema (har .parse)', () => {
    for (const [channel, schema] of Object.entries(channelResponseMap)) {
      expect(
        typeof (schema as { parse?: unknown }).parse,
        `${channel} saknar zod .parse`,
      ).toBe('function')
    }
  })
})
