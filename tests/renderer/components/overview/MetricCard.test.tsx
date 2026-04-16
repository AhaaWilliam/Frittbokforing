// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
