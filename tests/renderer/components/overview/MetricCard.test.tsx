// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MetricCard } from '../../../../src/renderer/components/overview/MetricCard'

// MetricCard is a pure presentational component — no providers needed.

describe('MetricCard', () => {
  it('renders label and value', () => {
    render(<MetricCard label="Intäkter" value="10 000 kr" />)
    expect(screen.getByText('Intäkter')).toBeInTheDocument()
    expect(screen.getByText('10 000 kr')).toBeInTheDocument()
  })

  it('variant=positive gives green text', () => {
    render(<MetricCard label="Resultat" value="5 000 kr" variant="positive" />)
    const valueEl = screen.getByText('5 000 kr')
    expect(valueEl.className).toContain('text-green')
  })

  it('variant=negative gives red text', () => {
    render(<MetricCard label="Resultat" value="-2 000 kr" variant="negative" />)
    const valueEl = screen.getByText('-2 000 kr')
    expect(valueEl.className).toContain('text-red')
  })

  it('shows skeleton when isLoading and no value', () => {
    const { container } = render(
      <MetricCard label="Intäkter" isLoading={true} />,
    )
    // Value text should not be rendered
    expect(screen.queryByText(/kr/)).not.toBeInTheDocument()
    // Skeleton placeholder with animate-pulse should be present
    const skeleton = container.querySelector('.animate-pulse')
    expect(skeleton).toBeInTheDocument()
  })

  it('renders sublabel when provided', () => {
    render(
      <MetricCard label="Intäkter" value="10 000 kr" sublabel="exkl. moms" />,
    )
    expect(screen.getByText('exkl. moms')).toBeInTheDocument()
  })

  // Sprint J F49-c2: onClick gör kortet fokuserbart + Enter-aktiverbart

  it('utan onClick renderas som div (presentational)', () => {
    const { container } = render(
      <MetricCard label="Intäkter" value="10 000 kr" />,
    )
    expect(container.querySelector('button')).toBeNull()
    expect(container.querySelector('div')).not.toBeNull()
  })

  it('med onClick renderas som button (fokuserbar)', () => {
    render(
      <MetricCard
        label="Intäkter"
        value="10 000 kr"
        onClick={() => {}}
      />,
    )
    const btn = screen.getByRole('button')
    expect(btn).toBeInTheDocument()
    expect(btn.getAttribute('type')).toBe('button')
  })

  it('klick på button triggar onClick', async () => {
    const onClick = vi.fn()
    render(
      <MetricCard label="Intäkter" value="10 000 kr" onClick={onClick} />,
    )
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('Enter på fokuserad button triggar onClick', async () => {
    const onClick = vi.fn()
    render(
      <MetricCard label="Intäkter" value="10 000 kr" onClick={onClick} />,
    )
    const btn = screen.getByRole('button')
    btn.focus()
    expect(document.activeElement).toBe(btn)
    await userEvent.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('button har focus:ring-styling', () => {
    render(
      <MetricCard label="Intäkter" value="10 000 kr" onClick={() => {}} />,
    )
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('focus:ring-2')
  })
})
