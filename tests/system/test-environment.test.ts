/**
 * Sprint 13b — META1
 *
 * Verify that test infrastructure meta-assumptions hold.
 * If these fail, other test results may be unreliable.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import {
  type SystemTestContext,
  createTemplateDb,
  destroyTemplateDb,
  createSystemTestContext,
  destroyContext,
} from './helpers/system-test-context'

let ctx: SystemTestContext

beforeAll(() => createTemplateDb())
afterAll(() => destroyTemplateDb())
beforeEach(() => { ctx = createSystemTestContext() })
afterEach(() => destroyContext(ctx))

describe('testmiljö — meta', () => {
  it('foreign_keys pragma är aktiverad — annars är FK-tester meningslösa', () => {
    expect(ctx.db.pragma('foreign_keys', { simple: true })).toBe(1)
  })
})
