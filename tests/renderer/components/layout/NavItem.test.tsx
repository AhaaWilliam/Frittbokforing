// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Home } from 'lucide-react'
import { NavItem } from '../../../../src/renderer/components/layout/NavItem'

describe('NavItem', () => {
  it('rendrar label och anropar onClick', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <NavItem icon={Home} label="Översikt" isActive={false} onClick={onClick} />,
    )
    await user.click(screen.getByRole('button', { name: /Översikt/ }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('isActive=true sätter accent-className', () => {
    render(
      <NavItem
        icon={Home}
        label="Aktiv"
        isActive
        onClick={() => {}}
        testId="nav-aktiv"
      />,
    )
    const btn = screen.getByTestId('nav-aktiv')
    expect(btn.className).toContain('bg-accent')
    expect(btn.className).toContain('font-medium')
  })

  it('isActive=false använder muted-färg', () => {
    render(
      <NavItem
        icon={Home}
        label="Inaktiv"
        isActive={false}
        onClick={() => {}}
        testId="nav-inaktiv"
      />,
    )
    expect(screen.getByTestId('nav-inaktiv').className).toContain(
      'text-muted-foreground',
    )
  })

  it('respekterar testId-prop', () => {
    render(
      <NavItem
        icon={Home}
        label="x"
        isActive={false}
        onClick={() => {}}
        testId="custom-id"
      />,
    )
    expect(screen.getByTestId('custom-id')).toBeInTheDocument()
  })
})
