// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Tooltip } from '../../../../src/renderer/components/ui/Tooltip'

describe('Tooltip', () => {
  it('döljer tooltip-content som default', () => {
    render(
      <Tooltip content="Mer info">
        <span>Hover me</span>
      </Tooltip>,
    )
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('visar tooltip vid hover', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip content="Mer info">
        <span>Hover me</span>
      </Tooltip>,
    )
    await user.hover(screen.getByText('Hover me'))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Mer info')
  })

  it('döljer tooltip vid unhover', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip content="Mer info">
        <span>Hover me</span>
      </Tooltip>,
    )
    const target = screen.getByText('Hover me')
    await user.hover(target)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    await user.unhover(target)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('visar tooltip vid focus (a11y krav)', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip content="Tab-info">
        <span>Focusable</span>
      </Tooltip>,
    )
    await user.tab()
    expect(screen.getByRole('tooltip')).toHaveTextContent('Tab-info')
  })

  it('aria-describedby pekar på tooltip-id när synlig', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip content="Info">
        <span>x</span>
      </Tooltip>,
    )
    await user.tab()
    const tooltip = screen.getByRole('tooltip')
    const trigger = screen.getByRole('button')
    expect(trigger.getAttribute('aria-describedby')).toBe(tooltip.id)
  })
})
