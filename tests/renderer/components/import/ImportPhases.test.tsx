// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImportSelectPhase } from '../../../../src/renderer/components/import/ImportSelectPhase'
import { ImportDonePhase } from '../../../../src/renderer/components/import/ImportDonePhase'
import type { ImportResult } from '../../../../src/renderer/components/import/import-types'

function makeResult(overrides?: Partial<ImportResult>): ImportResult {
  return {
    companyId: 1,
    fiscalYearId: 1,
    accountsAdded: 5,
    accountsUpdated: 2,
    entriesImported: 100,
    linesImported: 250,
    warnings: [],
    ...overrides,
  }
}

describe('ImportSelectPhase', () => {
  it('SIE4 default visar SIE4-text', () => {
    render(
      <ImportSelectPhase
        format="sie4"
        onFormatChange={() => {}}
        onSelectFile={() => {}}
      />,
    )
    expect(screen.getByText(/Välj SIE4-fil/)).toBeInTheDocument()
    expect(screen.getByText(/SIETYP 4/)).toBeInTheDocument()
  })

  it('SIE5 visar XML-text', () => {
    render(
      <ImportSelectPhase
        format="sie5"
        onFormatChange={() => {}}
        onSelectFile={() => {}}
      />,
    )
    expect(screen.getByText(/Välj SIE5-fil/)).toBeInTheDocument()
    expect(screen.getByText(/XML-format/)).toBeInTheDocument()
  })

  it('radio-byte anropar onFormatChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <ImportSelectPhase
        format="sie4"
        onFormatChange={onChange}
        onSelectFile={() => {}}
      />,
    )
    await user.click(screen.getByTestId('import-format-sie5'))
    expect(onChange).toHaveBeenCalledWith('sie5')
  })

  it('Välj fil-knapp anropar onSelectFile', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <ImportSelectPhase
        format="sie4"
        onFormatChange={() => {}}
        onSelectFile={onSelect}
      />,
    )
    await user.click(screen.getByRole('button', { name: /Välj fil/ }))
    expect(onSelect).toHaveBeenCalledOnce()
  })
})

describe('ImportDonePhase', () => {
  it('visar success-rubrik och 4 statistik-fält', () => {
    render(<ImportDonePhase result={makeResult()} onReset={() => {}} />)
    expect(screen.getByRole('heading', { name: /Import klar/ })).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument() // accountsAdded
    expect(screen.getByText('2')).toBeInTheDocument() // accountsUpdated
    expect(screen.getByText('100')).toBeInTheDocument() // entriesImported
    expect(screen.getByText('250')).toBeInTheDocument() // linesImported
  })

  it('döljer warnings-sektion när warnings är tom', () => {
    render(<ImportDonePhase result={makeResult()} onReset={() => {}} />)
    expect(screen.queryByText(/varningar:/)).not.toBeInTheDocument()
  })

  it('visar warnings-lista (max 5 + summering)', () => {
    const warnings = Array.from({ length: 8 }, (_, i) => `Varning ${i + 1}`)
    render(
      <ImportDonePhase result={makeResult({ warnings })} onReset={() => {}} />,
    )
    expect(screen.getByText(/8 varningar/)).toBeInTheDocument()
    expect(screen.getByText(/Varning 1/)).toBeInTheDocument()
    expect(screen.getByText(/Varning 5/)).toBeInTheDocument()
    expect(screen.queryByText(/Varning 6/)).not.toBeInTheDocument()
    expect(screen.getByText(/och 3 till/)).toBeInTheDocument()
  })

  it('"Importera en ny fil"-knapp anropar onReset', async () => {
    const user = userEvent.setup()
    const onReset = vi.fn()
    render(<ImportDonePhase result={makeResult()} onReset={onReset} />)
    await user.click(screen.getByRole('button', { name: /Importera en ny fil/ }))
    expect(onReset).toHaveBeenCalledOnce()
  })
})
