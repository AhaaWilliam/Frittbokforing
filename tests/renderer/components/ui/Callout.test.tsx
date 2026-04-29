// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { Callout } from '../../../../src/renderer/components/ui/Callout'

const AXE_OPTIONS: axe.RunOptions = {
  rules: { 'color-contrast': { enabled: false } },
}

describe('Callout', () => {
  it('renders children', () => {
    render(<Callout>Detta är ett meddelande.</Callout>)
    expect(screen.getByText('Detta är ett meddelande.')).toBeInTheDocument()
  })

  it('renders title when provided', () => {
    render(<Callout title="Kom ihåg">Verifikat låses efter bokföring.</Callout>)
    expect(screen.getByText('Kom ihåg')).toBeInTheDocument()
    expect(
      screen.getByText('Verifikat låses efter bokföring.'),
    ).toBeInTheDocument()
  })

  it.each([
    ['info', 'note'],
    ['tip', 'note'],
    ['warning', 'alert'],
    ['danger', 'alert'],
  ] as const)('uses correct ARIA role for %s', (variant, expectedRole) => {
    render(<Callout variant={variant}>x</Callout>)
    const root = screen.getByRole(expectedRole)
    expect(root).toHaveAttribute('data-variant', variant)
  })

  it('uses sr-aria-label when title is non-string', () => {
    render(
      <Callout variant="warning" title={<span>Komplex titel</span>}>
        body
      </Callout>,
    )
    const root = screen.getByRole('alert')
    expect(root.getAttribute('aria-label')).toBe('Varning')
  })

  it('omits aria-label when title is string (avoids double-announce)', () => {
    render(
      <Callout variant="warning" title="Varning">
        body
      </Callout>,
    )
    const root = screen.getByRole('alert')
    expect(root.getAttribute('aria-label')).toBeNull()
  })

  it('renders custom icon when provided', () => {
    render(<Callout icon={<span data-testid="custom-icon">★</span>}>x</Callout>)
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument()
  })

  it('uses default icon when no icon prop', () => {
    const { container } = render(<Callout variant="info">x</Callout>)
    // Default icons are inline SVGs, marked aria-hidden
    const svgs = container.querySelectorAll('svg[aria-hidden="true"]')
    expect(svgs.length).toBeGreaterThan(0)
  })

  it('renders accent bar (decorative)', () => {
    const { container } = render(<Callout>x</Callout>)
    const bar = container.querySelector('span[aria-hidden="true"].absolute')
    expect(bar).not.toBeNull()
  })

  it('applies className passthrough', () => {
    render(
      <Callout className="custom-x" variant="info">
        x
      </Callout>,
    )
    const root = screen.getByRole('note')
    expect(root.className).toContain('custom-x')
  })

  it('passes axe a11y check (all variants)', async () => {
    const { container } = render(
      <div>
        <Callout variant="info" title="Info">
          info text
        </Callout>
        <Callout variant="tip" title="Tip">
          tip text
        </Callout>
        <Callout variant="warning" title="Varning">
          warning text
        </Callout>
        <Callout variant="danger" title="Viktigt">
          danger text
        </Callout>
      </div>,
    )
    const results = await axe.run(container, AXE_OPTIONS)
    expect(results.violations).toEqual([])
  })
})
