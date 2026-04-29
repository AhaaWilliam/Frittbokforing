// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import axe from 'axe-core'
import {
  KbdChip,
  KbdChord,
} from '../../../../src/renderer/components/ui/KbdChip'

const AXE_OPTIONS: axe.RunOptions = {
  rules: { 'color-contrast': { enabled: false } },
}

describe('KbdChip', () => {
  it('renders children inside <kbd>', () => {
    const { container } = render(<KbdChip>⌘</KbdChip>)
    const kbd = container.querySelector('kbd')
    expect(kbd).not.toBeNull()
    expect(kbd?.textContent).toBe('⌘')
  })

  it('uses sm size by default', () => {
    const { container } = render(<KbdChip>K</KbdChip>)
    const kbd = container.querySelector('kbd')
    expect(kbd?.className).toContain('text-xs')
  })

  it('applies md size class', () => {
    const { container } = render(<KbdChip size="md">K</KbdChip>)
    const kbd = container.querySelector('kbd')
    expect(kbd?.className).toContain('text-sm')
  })

  it('uses mono font', () => {
    const { container } = render(<KbdChip>K</KbdChip>)
    const kbd = container.querySelector('kbd')
    expect(kbd?.className).toContain('font-mono')
  })
})

describe('KbdChord', () => {
  it('renders all keys', () => {
    const { container } = render(<KbdChord keys={['⌘', 'K']} />)
    const kbds = container.querySelectorAll('kbd')
    expect(kbds).toHaveLength(2)
    expect(kbds[0].textContent).toBe('⌘')
    expect(kbds[1].textContent).toBe('K')
  })

  it('renders separator between keys', () => {
    render(<KbdChord keys={['⌘', 'K']} />)
    expect(screen.getByText('+')).toBeInTheDocument()
  })

  it('omits separator before first key', () => {
    const { container } = render(<KbdChord keys={['⌘']} />)
    expect(container.querySelectorAll('kbd')).toHaveLength(1)
    // No separator span when only one key
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
  })

  it('renders custom separator', () => {
    render(<KbdChord keys={['Ctrl', 'Shift', 'P']} separator="·" />)
    const seps = screen.getAllByText('·')
    expect(seps).toHaveLength(2)
  })

  it('uses ariaLabel for the full chord', () => {
    const { container } = render(
      <KbdChord keys={['⌘', 'K']} ariaLabel="Kommando plus K" />,
    )
    const root = container.querySelector('[data-kbd-chord]')
    expect(root?.getAttribute('aria-label')).toBe('Kommando plus K')
    expect(root?.getAttribute('role')).toBe('group')
  })

  it('three-key chord renders two separators', () => {
    const { container } = render(
      <KbdChord keys={['⌘', '⇧', 'B']} ariaLabel="Kommando shift B" />,
    )
    expect(container.querySelectorAll('kbd')).toHaveLength(3)
    expect(screen.getAllByText('+')).toHaveLength(2)
  })

  it('passes axe a11y check', async () => {
    const { container } = render(
      <div>
        <KbdChip>Esc</KbdChip>
        <KbdChord keys={['⌘', 'K']} ariaLabel="Open palette" />
      </div>,
    )
    const results = await axe.run(container, AXE_OPTIONS)
    expect(results.violations).toEqual([])
  })
})
