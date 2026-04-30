// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SectionLabel } from '../../../../src/renderer/components/ui/SectionLabel'
import { ZoneNuHead } from '../../../../src/renderer/components/ui/ZoneNuHead'

describe('SectionLabel', () => {
  it('renders children with .section-label class', () => {
    const { container } = render(<SectionLabel>PERIOD</SectionLabel>)
    const el = container.querySelector('.section-label')
    expect(el).not.toBeNull()
    expect(el?.textContent).toBe('PERIOD')
  })

  it('renders as div by default', () => {
    const { container } = render(<SectionLabel>X</SectionLabel>)
    expect(container.firstChild?.nodeName).toBe('DIV')
  })

  it('honors `as` prop', () => {
    const { container } = render(<SectionLabel as="h2">Title</SectionLabel>)
    expect(container.firstChild?.nodeName).toBe('H2')
  })

  it('appends extra className', () => {
    const { container } = render(
      <SectionLabel className="mt-4">Foo</SectionLabel>,
    )
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('section-label')
    expect(el.className).toContain('mt-4')
  })
})

describe('ZoneNuHead', () => {
  it('renders title in h2', () => {
    render(<ZoneNuHead title="Verifikat — november 2025" />)
    expect(
      screen.getByRole('heading', { level: 2, name: /Verifikat/ }),
    ).toBeInTheDocument()
  })

  it('renders sub-text when provided', () => {
    render(
      <ZoneNuHead title="Konton" sub="BAS 2025 · 18 aktiva konton" />,
    )
    expect(screen.getByText(/BAS 2025/)).toBeInTheDocument()
  })

  it('omits sub-paragraph when not provided', () => {
    const { container } = render(<ZoneNuHead title="Bara titel" />)
    const paragraphs = container.querySelectorAll('p')
    expect(paragraphs).toHaveLength(0)
  })

  it('honors testId prop', () => {
    render(<ZoneNuHead title="X" testId="zone-head" />)
    expect(screen.getByTestId('zone-head')).toBeInTheDocument()
  })
})
