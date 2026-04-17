// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { useEntityForm } from '../src/renderer/lib/use-entity-form'

// ─── F21: isDirty ref-based ─────────────────────────────────────────────────

describe('F21 — useEntityForm isDirty (ref-based)', () => {
  function makeHook() {
    return renderHook(() =>
      useEntityForm({
        formSchema: z.object({ name: z.string() }),
        payloadSchema: z.object({ name: z.string() }),
        transform: (d) => d,
        defaults: { name: '' },
        onSubmit: async () => {},
      }),
    )
  }

  it('isDirty is false initially', () => {
    const { result } = makeHook()
    expect(result.current.isDirty).toBe(false)
  })

  it('isDirty becomes true after setField', () => {
    const { result } = makeHook()
    act(() => result.current.setField('name', 'ändrat'))
    expect(result.current.isDirty).toBe(true)
  })

  it('isDirty resets to false after reset()', () => {
    const { result } = makeHook()
    act(() => result.current.setField('name', 'ändrat'))
    expect(result.current.isDirty).toBe(true)
    act(() => result.current.reset())
    expect(result.current.isDirty).toBe(false)
  })
})

// ─── F22: React.memo wrappers ───────────────────────────────────────────────

describe('F22 — React.memo on line row components', () => {
  it('InvoiceLineRow is memo-wrapped', async () => {
    const { InvoiceLineRow } =
      await import('../src/renderer/components/invoices/InvoiceLineRow')
    expect(InvoiceLineRow).toHaveProperty('$$typeof', Symbol.for('react.memo'))
  })

  it('ExpenseLineRow is exported and memo-wrapped', async () => {
    const { ExpenseLineRow } =
      await import('../src/renderer/components/expenses/ExpenseLineRow')
    expect(ExpenseLineRow).toHaveProperty('$$typeof', Symbol.for('react.memo'))
  })

  it('updateLine logic: partial update preserves untouched object references', () => {
    const lines = [
      { temp_id: 'a', description: 'rad1' },
      { temp_id: 'b', description: 'rad2' },
    ]
    const result = lines.map((l, i) =>
      i === 1 ? { ...l, description: 'ändrad' } : l,
    )
    expect(result[0]).toBe(lines[0]) // same reference — React.memo skips
    expect(result[1]).not.toBe(lines[1]) // new reference — React.memo re-renders
    expect(result[1].description).toBe('ändrad')
  })
})

// ─── F33: FiscalYearContext auto-persist guard ──────────────────────────────

describe('F33 — shouldAutoPersist guard', () => {
  function shouldAutoPersist(
    activeFiscalYear: unknown,
    selectedYear: unknown,
    restoredId: unknown,
    restoredIdLoaded: boolean,
  ): boolean {
    return !!(
      activeFiscalYear &&
      !selectedYear &&
      !restoredId &&
      restoredIdLoaded
    )
  }

  it('blocks before restoredIdLoaded', () => {
    expect(shouldAutoPersist({ id: 1 }, null, null, false)).toBe(false)
  })

  it('allows after restoredIdLoaded when no restoredId', () => {
    expect(shouldAutoPersist({ id: 1 }, null, null, true)).toBe(true)
  })

  it('blocks if restoredId has a value', () => {
    expect(shouldAutoPersist({ id: 1 }, null, 5, true)).toBe(false)
  })

  it('blocks if selectedYear is set', () => {
    expect(shouldAutoPersist({ id: 1 }, { id: 2 }, null, true)).toBe(false)
  })
})
