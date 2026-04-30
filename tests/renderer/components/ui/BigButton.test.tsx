// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { BigButton } from '../../../../src/renderer/components/ui/BigButton'

const AXE_OPTIONS: axe.RunOptions = {
  rules: { 'color-contrast': { enabled: false } },
}

describe('BigButton', () => {
  it('renders label and hint', () => {
    render(
      <BigButton
        color="plommon"
        label="Bokför kostnad"
        hint="Kvitto eller faktura"
        onClick={() => {}}
      />,
    )
    expect(screen.getByText('Bokför kostnad')).toBeInTheDocument()
    expect(screen.getByText('Kvitto eller faktura')).toBeInTheDocument()
  })

  it('triggers onClick when clicked', async () => {
    const handleClick = vi.fn()
    render(
      <BigButton
        color="mint"
        label="Test"
        hint="Hint"
        onClick={handleClick}
        testId="big-btn-test"
      />,
    )
    await userEvent.click(screen.getByTestId('big-btn-test'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('applies different color tokens per variant', () => {
    const { container, rerender } = render(
      <BigButton color="plommon" label="A" hint="a" onClick={() => {}} />,
    )
    const plommonDot = container.querySelector('span[aria-hidden="true"]')
    expect(plommonDot?.getAttribute('style')).toContain(
      'var(--color-brand-500)',
    )

    rerender(
      <BigButton color="mint" label="A" hint="a" onClick={() => {}} />,
    )
    const mintDot = container.querySelector('span[aria-hidden="true"]')
    expect(mintDot?.getAttribute('style')).toContain('var(--color-mint-500)')

    rerender(
      <BigButton color="dark" label="A" hint="a" onClick={() => {}} />,
    )
    const darkDot = container.querySelector('span[aria-hidden="true"]')
    expect(darkDot?.getAttribute('style')).toContain('var(--color-dark)')
  })

  it('is type=button (no inadvertent form submit)', () => {
    render(
      <BigButton color="plommon" label="X" hint="y" onClick={() => {}} />,
    )
    const btn = screen.getByRole('button', { name: /X/ })
    expect(btn).toHaveAttribute('type', 'button')
  })

  it('passes axe a11y check', async () => {
    const { container } = render(
      <BigButton
        color="plommon"
        label="Bokför kostnad"
        hint="Kvitto eller faktura"
        onClick={() => {}}
      />,
    )
    const results = await axe.run(container, AXE_OPTIONS)
    expect(results.violations).toEqual([])
  })
})
