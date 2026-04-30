// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  KonteringHeader,
  KonteringRow,
} from '../../../../src/renderer/components/ui/KonteringRow'

describe('KonteringRow', () => {
  it('renders account, description, debit, credit', () => {
    render(
      <KonteringRow
        account="6570"
        description="Bankavgift"
        debit={5000}
      />,
    )
    expect(screen.getByText('6570')).toBeInTheDocument()
    expect(screen.getByText('Bankavgift')).toBeInTheDocument()
    // Intl sv-SE-format: "50 kr" eller "50 kr" (NBSP)
    expect(screen.getByText(/^50[\s ]+kr$/)).toBeInTheDocument()
  })

  it('renders only debit-cell when credit absent', () => {
    const { container } = render(
      <KonteringRow account="1910" debit={10000} />,
    )
    const cells = container.querySelectorAll('span.text-right')
    // 2 right-aligned spans: debet + kredit (kredit ska vara tom).
    // Intl.NumberFormat sv-SE använder   (NBSP) mellan belopp och valuta.
    expect(cells.length).toBe(2)
    expect(cells[0]?.textContent).toMatch(/^100[\s ]+kr$/)
    expect(cells[1]?.textContent).toBe('')
  })

  it('renders only credit-cell when debit absent', () => {
    const { container } = render(
      <KonteringRow account="3010" credit={50000} />,
    )
    const cells = container.querySelectorAll('span.text-right')
    expect(cells[0]?.textContent).toBe('')
    expect(cells[1]?.textContent).toMatch(/^500[\s ]+kr$/)
  })

  it('renders dash placeholder when description omitted', () => {
    render(<KonteringRow account="—" />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

describe('KonteringHeader', () => {
  it('renders four header columns', () => {
    render(<KonteringHeader />)
    expect(screen.getByText('Konto')).toBeInTheDocument()
    expect(screen.getByText('Beskrivning')).toBeInTheDocument()
    expect(screen.getByText('Debet')).toBeInTheDocument()
    expect(screen.getByText('Kredit')).toBeInTheDocument()
  })
})
