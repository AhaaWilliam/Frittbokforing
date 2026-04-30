// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { Pill } from '../../../../src/renderer/components/ui/Pill'

const AXE_OPTIONS: axe.RunOptions = {
  rules: { 'color-contrast': { enabled: false } },
}

describe('Pill', () => {
  it('renders children', () => {
    render(<Pill>Utkast</Pill>)
    expect(screen.getByText('Utkast')).toBeInTheDocument()
  })

  it('defaults to neutral / sm', () => {
    render(<Pill>X</Pill>)
    const pill = screen.getByText('X')
    expect(pill).toHaveAttribute('data-variant', 'neutral')
    expect(pill).toHaveAttribute('data-size', 'sm')
  })

  it.each([
    ['neutral'],
    ['brand'],
    ['success'],
    ['warning'],
    ['danger'],
    ['info'],
  ] as const)('applies %s variant classes', (variant) => {
    render(<Pill variant={variant}>label</Pill>)
    const pill = screen.getByText('label')
    expect(pill).toHaveAttribute('data-variant', variant)
    // Tailwind class for bg-{variant}-... should be present
    expect(pill.className).toMatch(new RegExp(`(bg-${variant}|bg-neutral)`))
  })

  it('renders dot when withDot=true', () => {
    const { container } = render(
      <Pill variant="success" withDot>
        Aktiv
      </Pill>,
    )
    const dot = container.querySelector('[aria-hidden="true"]')
    expect(dot).not.toBeNull()
    expect(dot?.className).toContain('rounded-full')
  })

  it('omits dot by default', () => {
    const { container } = render(<Pill>Aktiv</Pill>)
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
  })

  it('passes through className', () => {
    render(
      <Pill className="custom-class" variant="brand">
        x
      </Pill>,
    )
    expect(screen.getByText('x').className).toContain('custom-class')
  })

  it('passes axe a11y check (all variants)', async () => {
    const { container } = render(
      <div>
        <Pill variant="neutral">N</Pill>
        <Pill variant="brand" withDot>
          B
        </Pill>
        <Pill variant="success">S</Pill>
        <Pill variant="warning">W</Pill>
        <Pill variant="danger">D</Pill>
        <Pill variant="info" size="md">
          I
        </Pill>
      </div>,
    )
    const results = await axe.run(container, AXE_OPTIONS)
    expect(results.violations).toEqual([])
  })

  // Sprint 74 — xs-size för täta tabeller (depreciation-schedule, dense lists).
  it('size="xs" sätter data-size och text-[10px]', () => {
    const { container } = render(
      <Pill size="xs" variant="success">
        OK
      </Pill>,
    )
    const pill = container.firstElementChild as HTMLElement
    expect(pill).toHaveAttribute('data-size', 'xs')
    expect(pill.className).toContain('text-[10px]')
  })

  it('alla size-varianter renderar utan a11y-violations', async () => {
    const { container } = render(
      <div>
        <Pill size="xs">xs</Pill>
        <Pill size="sm">sm</Pill>
        <Pill size="md">md</Pill>
      </div>,
    )
    const results = await axe.run(container, AXE_OPTIONS)
    expect(results.violations).toEqual([])
  })
})
