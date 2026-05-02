// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { StatusCard } from '../../../../src/renderer/components/ui/StatusCard'

const AXE_OPTIONS: axe.RunOptions = {
  rules: { 'color-contrast': { enabled: false } },
}

describe('StatusCard', () => {
  it('renders title and value', () => {
    render(<StatusCard title="Likvida medel" value="123 456 kr" />)
    expect(screen.getByText('Likvida medel')).toBeInTheDocument()
    expect(screen.getByText('123 456 kr')).toBeInTheDocument()
  })

  it('renders hint when provided', () => {
    render(
      <StatusCard title="Moms" value="42 000 kr" hint="Förfaller 12 jul" />,
    )
    expect(screen.getByText('Förfaller 12 jul')).toBeInTheDocument()
  })

  it('omits hint when not provided', () => {
    const { container } = render(<StatusCard title="Saldo" value="1 000 kr" />)
    // Three direct <p> children expected when no hint: title, value
    const paragraphs = container.querySelectorAll('p')
    expect(paragraphs).toHaveLength(2)
  })

  it('renders as button when onClick provided', async () => {
    const onClick = vi.fn()
    render(
      <StatusCard
        title="Klicka"
        value="x"
        onClick={onClick}
        ariaLabel="Klickbart kort"
      />,
    )
    const button = screen.getByRole('button', { name: 'Klickbart kort' })
    expect(button).toBeInTheDocument()
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('activates onClick via Enter key (native button)', async () => {
    const onClick = vi.fn()
    render(
      <StatusCard title="x" value="1" onClick={onClick} ariaLabel="Kort" />,
    )
    const button = screen.getByRole('button')
    button.focus()
    await userEvent.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders as div without onClick', () => {
    render(<StatusCard title="x" value="1" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('applies mono class when mono=true', () => {
    render(<StatusCard title="x" value="1234.56" mono />)
    const valueEl = screen.getByText('1234.56')
    expect(valueEl.className).toContain('font-mono')
    expect(valueEl.className).not.toContain('font-serif')
  })

  it('uses serif font by default', () => {
    render(<StatusCard title="x" value="1" />)
    const valueEl = screen.getByText('1')
    expect(valueEl.className).toContain('font-serif')
  })

  it.each(['default', 'accent', 'muted'] as const)(
    'applies %s variant',
    (variant) => {
      render(<StatusCard title="t" value="v" variant={variant} />)
      const valueEl = screen.getByText('v')
      // VS-77: Variant affects color class on value (design-tokens eller brand-)
      expect(valueEl.className).toMatch(/text-\[var\(--text-|text-brand-/)
    },
  )

  it('passes axe a11y check', async () => {
    const { container } = render(
      <div>
        <StatusCard title="Static" value="100" hint="Hint text" />
        <StatusCard
          title="Clickable"
          value="200"
          onClick={() => {}}
          ariaLabel="Klickbart"
        />
      </div>,
    )
    const results = await axe.run(container, AXE_OPTIONS)
    expect(results.violations).toEqual([])
  })
})
