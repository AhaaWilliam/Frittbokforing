// @vitest-environment jsdom
/**
 * Sprint 88 — TableSkeleton-tester.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import * as axe from 'axe-core'
import { TableSkeleton } from '../../../../src/renderer/components/ui/TableSkeleton'

describe('TableSkeleton', () => {
  it('renderar default 5 rader × N kolumner', () => {
    render(<TableSkeleton columns={4} />)
    const skeleton = screen.getByTestId('table-skeleton')
    const rows = skeleton.querySelectorAll('tbody tr')
    expect(rows.length).toBe(5)
    // Varje rad ska ha N celler (ingen select-kolumn här)
    expect(rows[0].querySelectorAll('td').length).toBe(4)
  })

  it('inkluderar select-kolumn när withSelectColumn=true', () => {
    render(<TableSkeleton columns={4} withSelectColumn rows={3} />)
    const rows = screen
      .getByTestId('table-skeleton')
      .querySelectorAll('tbody tr')
    expect(rows.length).toBe(3)
    // 4 + 1 select-kolumn
    expect(rows[0].querySelectorAll('td').length).toBe(5)
  })

  it('har aria-busy + aria-label för screen readers', () => {
    render(<TableSkeleton columns={4} ariaLabel="Laddar fakturor" />)
    const skeleton = screen.getByTestId('table-skeleton')
    expect(skeleton.getAttribute('aria-busy')).toBe('true')
    expect(skeleton.getAttribute('aria-label')).toBe('Laddar fakturor')
    expect(skeleton.getAttribute('role')).toBe('status')
  })

  it('passerar axe a11y', async () => {
    const { container } = render(<TableSkeleton columns={4} />)
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
