// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { CheckLine } from '../../../../src/renderer/components/ui/CheckLine'

const AXE_OPTIONS: axe.RunOptions = {
  rules: { 'color-contrast': { enabled: false } },
}

describe('CheckLine', () => {
  it('renders label', () => {
    render(<CheckLine state="check" label="Balanserat" />)
    expect(screen.getByText('Balanserat')).toBeInTheDocument()
  })

  it('renders description when provided', () => {
    render(
      <CheckLine
        state="check"
        label="Verifikat skapat"
        description="Verifikat A12 sparat och låst"
      />,
    )
    expect(
      screen.getByText('Verifikat A12 sparat och låst'),
    ).toBeInTheDocument()
  })

  it('omits description when not provided', () => {
    render(<CheckLine state="check" label="LabelOnly" />)
    // The description-only span uses text-xs text-neutral-500 — it shouldn't exist.
    expect(screen.getByText('LabelOnly')).toBeInTheDocument()
    expect(screen.queryByText(/^.*Verifikat.*$/)).toBeNull()
    // Negative: there's no second .text-xs.text-neutral-500 sibling under
    // the text container.
    const labelEl = screen.getByText('LabelOnly')
    const textContainer = labelEl.parentElement
    expect(textContainer).not.toBeNull()
    // text container should have exactly 1 child (the label span)
    expect(textContainer?.children.length).toBe(1)
  })

  it.each(['check', 'cross', 'pending', 'info'] as const)(
    'reflects %s state in data attribute',
    (state) => {
      const { container } = render(<CheckLine state={state} label="x" />)
      const root = container.firstChild as HTMLElement
      expect(root.getAttribute('data-state')).toBe(state)
    },
  )

  it('includes sr-only state label for screen readers', () => {
    render(<CheckLine state="check" label="Balanserat" />)
    expect(screen.getByText('Klar:')).toBeInTheDocument()
  })

  it.each([
    ['check', 'Klar'],
    ['cross', 'Misslyckad'],
    ['pending', 'Väntar'],
    ['info', 'Information'],
  ] as const)('sr-only label for %s state is %s', (state, expected) => {
    render(<CheckLine state={state} label="x" />)
    expect(screen.getByText(`${expected}:`)).toBeInTheDocument()
  })

  it('renders SVG icon as aria-hidden', () => {
    const { container } = render(<CheckLine state="check" label="x" />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
  })

  it('passes axe a11y check (all states)', async () => {
    const { container } = render(
      <ul>
        <li>
          <CheckLine state="check" label="OK" description="Allt bra" />
        </li>
        <li>
          <CheckLine state="cross" label="Fel" description="Något bröt" />
        </li>
        <li>
          <CheckLine state="pending" label="Väntar" />
        </li>
        <li>
          <CheckLine state="info" label="Info" />
        </li>
      </ul>,
    )
    const results = await axe.run(container, AXE_OPTIONS)
    expect(results.violations).toEqual([])
  })
})
