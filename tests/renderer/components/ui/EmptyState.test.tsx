// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { EmptyState } from '../../../../src/renderer/components/ui/EmptyState'

const AXE_OPTIONS: axe.RunOptions = {
  rules: { 'color-contrast': { enabled: false } },
}

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(
      <EmptyState
        icon={<span data-testid="icon">X</span>}
        title="Inget här"
        description="Det finns inga poster att visa."
      />,
    )
    expect(screen.getByText('Inget här')).toBeInTheDocument()
    expect(screen.getByText('Det finns inga poster att visa.')).toBeInTheDocument()
    expect(screen.getByTestId('icon')).toBeInTheDocument()
  })

  it('renders action button with label when action provided', async () => {
    const onClick = vi.fn()
    render(
      <EmptyState
        icon={<span>X</span>}
        title="Tom"
        description="Ingen data"
        action={{ label: 'Lägg till', onClick }}
      />,
    )
    const button = screen.getByRole('button', { name: 'Lägg till' })
    expect(button).toBeInTheDocument()

    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('hides action button without action prop', () => {
    render(
      <EmptyState
        icon={<span>X</span>}
        title="Tom"
        description="Ingen data"
      />,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('passes axe a11y check', async () => {
    const { container } = render(
      <EmptyState
        icon={<span>X</span>}
        title="Tom"
        description="Ingen data"
        action={{ label: 'Skapa', onClick: vi.fn() }}
      />,
    )
    const results = await axe.run(container, AXE_OPTIONS)
    expect(results.violations).toEqual([])
  })
})
