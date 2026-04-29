// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { ConsequencePane } from '../../../../src/renderer/components/consequence/ConsequencePane'

const AXE_OPTIONS: axe.RunOptions = {
  rules: { 'color-contrast': { enabled: false } },
}

const balancedPreview = {
  lines: [
    {
      account_number: '1930',
      account_name: 'Bankkonto',
      debit_ore: 100000,
      credit_ore: 0,
      description: null,
    },
    {
      account_number: '6230',
      account_name: 'Telefoni',
      debit_ore: 0,
      credit_ore: 100000,
      description: null,
    },
  ],
  total_debit_ore: 100000,
  total_credit_ore: 100000,
  balanced: true,
  entry_date: '2026-04-29',
  description: 'Test-verifikat',
  warnings: [] as string[],
}

const unbalancedPreview = {
  ...balancedPreview,
  lines: [
    { ...balancedPreview.lines[0], debit_ore: 100000, credit_ore: 0 },
    { ...balancedPreview.lines[1], debit_ore: 0, credit_ore: 50000 },
  ],
  total_debit_ore: 100000,
  total_credit_ore: 50000,
  balanced: false,
  warnings: ['Verifikatet balanserar inte (mer debet än kredit: 50000 öre).'],
}

describe('ConsequencePane', () => {
  it('renders idle state when no preview and not pending', () => {
    render(<ConsequencePane preview={null} pending={false} error={null} />)
    expect(screen.getByTestId('consequence-pane-idle')).toBeInTheDocument()
    expect(
      screen.getByText(/Fyll i formuläret för att se verifikatet/),
    ).toBeInTheDocument()
  })

  it('renders custom idleHint when provided', () => {
    render(
      <ConsequencePane
        preview={null}
        pending={false}
        error={null}
        idleHint="Custom hint text"
      />,
    )
    expect(screen.getByText('Custom hint text')).toBeInTheDocument()
  })

  it('renders pending state', () => {
    render(<ConsequencePane preview={null} pending={true} error={null} />)
    expect(screen.getByTestId('consequence-pane-pending')).toBeInTheDocument()
    expect(screen.getByText('Beräknar...')).toBeInTheDocument()
  })

  it('renders error state takes priority', () => {
    render(
      <ConsequencePane
        preview={balancedPreview}
        pending={false}
        error={{ code: 'VALIDATION_ERROR', message: 'Något gick fel' }}
      />,
    )
    expect(screen.getByTestId('consequence-pane-error')).toBeInTheDocument()
    expect(screen.getByText('Något gick fel')).toBeInTheDocument()
    expect(
      screen.queryByTestId('consequence-pane-active'),
    ).not.toBeInTheDocument()
  })

  it('renders preview lines with account names', () => {
    render(
      <ConsequencePane
        preview={balancedPreview}
        pending={false}
        error={null}
      />,
    )
    expect(screen.getByTestId('consequence-pane-active')).toBeInTheDocument()
    expect(screen.getByText('1930')).toBeInTheDocument()
    expect(screen.getByText('Bankkonto')).toBeInTheDocument()
    expect(screen.getByText('6230')).toBeInTheDocument()
    expect(screen.getByText('Telefoni')).toBeInTheDocument()
  })

  it('shows balanced status pill when balanced', () => {
    render(
      <ConsequencePane
        preview={balancedPreview}
        pending={false}
        error={null}
      />,
    )
    expect(screen.getByText('Balanserar')).toBeInTheDocument()
  })

  it('shows obalans status pill when not balanced', () => {
    render(
      <ConsequencePane
        preview={unbalancedPreview}
        pending={false}
        error={null}
      />,
    )
    // "Obalans" finns både i Pill och CheckLine label — räcker att verifiera
    // att texten finns minst en gång (båda elementen ska reagera på balanced=false)
    expect(screen.getAllByText('Obalans').length).toBeGreaterThan(0)
  })

  it('shows totals', () => {
    render(
      <ConsequencePane
        preview={balancedPreview}
        pending={false}
        error={null}
      />,
    )
    expect(screen.getByTestId('preview-total-debit')).toBeInTheDocument()
    expect(screen.getByTestId('preview-total-credit')).toBeInTheDocument()
  })

  it('shows entry date and description', () => {
    render(
      <ConsequencePane
        preview={balancedPreview}
        pending={false}
        error={null}
      />,
    )
    expect(screen.getByText(/2026-04-29/)).toBeInTheDocument()
    expect(screen.getByText(/Test-verifikat/)).toBeInTheDocument()
  })

  it('shows warnings when present', () => {
    render(
      <ConsequencePane
        preview={unbalancedPreview}
        pending={false}
        error={null}
      />,
    )
    expect(screen.getByText(/Verifikatet balanserar inte/)).toBeInTheDocument()
  })

  it('omits warnings callout when no warnings', () => {
    render(
      <ConsequencePane
        preview={balancedPreview}
        pending={false}
        error={null}
      />,
    )
    expect(screen.queryByText('Att åtgärda')).not.toBeInTheDocument()
  })

  it('uses aria-live=polite for screen readers', () => {
    render(
      <ConsequencePane
        preview={balancedPreview}
        pending={false}
        error={null}
      />,
    )
    const pane = screen.getByTestId('consequence-pane-active')
    expect(pane.getAttribute('aria-live')).toBe('polite')
  })

  it('passes axe a11y check (active state)', async () => {
    const { container } = render(
      <ConsequencePane
        preview={balancedPreview}
        pending={false}
        error={null}
      />,
    )
    const results = await axe.run(container, AXE_OPTIONS)
    expect(results.violations).toEqual([])
  })

  it('passes axe a11y check (idle state)', async () => {
    const { container } = render(
      <ConsequencePane preview={null} pending={false} error={null} />,
    )
    const results = await axe.run(container, AXE_OPTIONS)
    expect(results.violations).toEqual([])
  })
})
