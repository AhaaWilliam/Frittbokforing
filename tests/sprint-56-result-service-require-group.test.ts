import { describe, it, expect } from 'vitest'
import { _requireGroupForTesting } from '../src/main/services/result-service'
import type { ReportGroupResult } from '../src/shared/types'

// Sprint 56 — kill 13 surviving optional-chaining mutants in result-service.
// Refaktor: `groups.find(...)?.subtotalNet ?? 0` → `requireGroup(...).subtotalNet`.
// Mutation testing-mat: throw vid saknad grupp ger Stryker en signal istället
// för att tyst returnera 0.

function makeGroup(
  id: string,
  subtotalNet: number,
  subtotalDisplay: number,
): ReportGroupResult {
  return {
    id,
    label: id,
    subtotalNet,
    subtotalDisplay,
    lines: [],
  }
}

describe('Sprint 56 — requireGroup invariant guard', () => {
  it('returnerar gruppen när id matchar', () => {
    const groups = [
      makeGroup('operating_income', 100, 100),
      makeGroup('operating_expenses', -50, 50),
      makeGroup('financial_items', 10, 10),
      makeGroup('appropriations_and_tax', -20, 20),
    ]

    const found = _requireGroupForTesting(groups, 'operating_income')
    expect(found.subtotalNet).toBe(100)
    expect(found.subtotalDisplay).toBe(100)
  })

  it('hittar grupp i mitten av arrayen', () => {
    const groups = [
      makeGroup('operating_income', 100, 100),
      makeGroup('operating_expenses', -50, 50),
      makeGroup('financial_items', 10, 10),
      makeGroup('appropriations_and_tax', -20, 20),
    ]

    expect(_requireGroupForTesting(groups, 'financial_items').subtotalNet).toBe(
      10,
    )
    expect(
      _requireGroupForTesting(groups, 'appropriations_and_tax').subtotalNet,
    ).toBe(-20)
  })

  it('kastar med tydligt felmeddelande när grupp saknas', () => {
    const groups = [makeGroup('operating_income', 100, 100)]

    expect(() => _requireGroupForTesting(groups, 'financial_items')).toThrow(
      /financial_items/,
    )
    expect(() => _requireGroupForTesting(groups, 'financial_items')).toThrow(
      /invariant broken/,
    )
  })

  it('kastar på tom grupp-array', () => {
    expect(() => _requireGroupForTesting([], 'operating_income')).toThrow(
      /operating_income/,
    )
  })

  it('kastar för okänt id även när andra grupper finns', () => {
    const groups = [
      makeGroup('operating_income', 100, 100),
      makeGroup('operating_expenses', -50, 50),
    ]

    expect(() => _requireGroupForTesting(groups, 'nonexistent')).toThrow(
      /nonexistent/,
    )
  })
})
