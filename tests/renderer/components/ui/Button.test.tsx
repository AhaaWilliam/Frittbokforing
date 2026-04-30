// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as axe from 'axe-core'
import { Button } from '../../../../src/renderer/components/ui/Button'

describe('Button', () => {
  it('renderar med default variant=primary, size=md', () => {
    render(<Button>Spara</Button>)
    const btn = screen.getByRole('button', { name: 'Spara' })
    expect(btn.className).toContain('bg-primary')
    expect(btn.className).toContain('text-sm')
    expect(btn.className).toContain('px-4')
  })

  it('destructive variant använder danger-tokens', () => {
    render(<Button variant="destructive">Ta bort</Button>)
    const btn = screen.getByRole('button', { name: 'Ta bort' })
    expect(btn.className).toContain('bg-danger-500')
    expect(btn.className).toContain('hover:bg-danger-600')
  })

  it('warning variant använder warning-tokens', () => {
    render(<Button variant="warning">Korrigera</Button>)
    const btn = screen.getByRole('button', { name: 'Korrigera' })
    expect(btn.className).toContain('bg-warning-500')
  })

  it('isLoading visar spinner och blockerar onClick', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Button isLoading onClick={onClick}>
        Spara
      </Button>,
    )
    const btn = screen.getByRole('button')
    expect(btn.getAttribute('aria-busy')).toBe('true')
    expect(btn).toBeDisabled()
    await user.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('disabled-state blockerar interaktion', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Klicka
      </Button>,
    )
    await user.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('size=sm ger text-xs px-2', () => {
    render(<Button size="sm">Liten</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('text-xs')
    expect(btn.className).toContain('px-2')
  })

  it('type defaultar till "button" (förhindrar form-submit)', () => {
    render(<Button>Klicka</Button>)
    expect(screen.getByRole('button').getAttribute('type')).toBe('button')
  })

  it('type=submit propageras', () => {
    render(<Button type="submit">Skicka</Button>)
    expect(screen.getByRole('button').getAttribute('type')).toBe('submit')
  })

  it('destructive-outline variant använder border + text-danger', () => {
    render(<Button variant="destructive-outline">Ta bort</Button>)
    const btn = screen.getByRole('button', { name: 'Ta bort' })
    expect(btn.className).toContain('border-danger-100')
    expect(btn.className).toContain('text-danger-500')
  })

  it('passerar axe a11y i alla varianter', async () => {
    const variants = [
      'primary',
      'secondary',
      'destructive',
      'destructive-outline',
      'warning',
      'ghost',
    ] as const
    for (const v of variants) {
      const { container, unmount } = render(<Button variant={v}>Test</Button>)
      const results = await axe.run(container)
      expect(results.violations, `axe failed for ${v}`).toEqual([])
      unmount()
    }
  })
})
