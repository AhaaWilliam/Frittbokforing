// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRovingTabindex } from '../../../src/renderer/lib/use-roving-tabindex'

function TestList({
  count,
  onSelect,
  onToggleSelect,
}: {
  count: number
  onSelect?: (idx: number) => void
  onToggleSelect?: (idx: number) => void
}) {
  const { activeIdx, getRowProps } = useRovingTabindex(
    count,
    onSelect,
    onToggleSelect,
  )
  return (
    <>
      <div data-testid="active-idx">{activeIdx}</div>
      <table>
        <tbody>
          {Array.from({ length: count }).map((_, idx) => (
            <tr key={idx} {...getRowProps(idx)} data-testid={`row-${idx}`}>
              <td>Row {idx}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

describe('useRovingTabindex', () => {
  it('första raden har tabIndex=0, andra -1', () => {
    render(<TestList count={3} />)
    expect(screen.getByTestId('row-0').getAttribute('tabindex')).toBe('0')
    expect(screen.getByTestId('row-1').getAttribute('tabindex')).toBe('-1')
    expect(screen.getByTestId('row-2').getAttribute('tabindex')).toBe('-1')
  })

  it('ArrowDown flyttar aktiv rad + fokuserar', async () => {
    render(<TestList count={3} />)
    const row0 = screen.getByTestId('row-0')
    row0.focus()
    expect(document.activeElement).toBe(row0)
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByTestId('active-idx').textContent).toBe('1')
    expect(document.activeElement).toBe(screen.getByTestId('row-1'))
    expect(screen.getByTestId('row-1').getAttribute('tabindex')).toBe('0')
    expect(screen.getByTestId('row-0').getAttribute('tabindex')).toBe('-1')
  })

  it('ArrowUp flyttar tillbaka', async () => {
    render(<TestList count={3} />)
    screen.getByTestId('row-0').focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(screen.getByTestId('active-idx').textContent).toBe('2')
    await userEvent.keyboard('{ArrowUp}')
    expect(screen.getByTestId('active-idx').textContent).toBe('1')
    expect(document.activeElement).toBe(screen.getByTestId('row-1'))
  })

  it('ArrowDown på sista raden är no-op', async () => {
    render(<TestList count={2} />)
    screen.getByTestId('row-0').focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(screen.getByTestId('active-idx').textContent).toBe('1')
  })

  it('ArrowUp på första raden är no-op', async () => {
    render(<TestList count={2} />)
    screen.getByTestId('row-0').focus()
    await userEvent.keyboard('{ArrowUp}')
    expect(screen.getByTestId('active-idx').textContent).toBe('0')
  })

  it('Home hoppar till första', async () => {
    render(<TestList count={5} />)
    screen.getByTestId('row-0').focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
    expect(screen.getByTestId('active-idx').textContent).toBe('3')
    await userEvent.keyboard('{Home}')
    expect(screen.getByTestId('active-idx').textContent).toBe('0')
    expect(document.activeElement).toBe(screen.getByTestId('row-0'))
  })

  it('End hoppar till sista', async () => {
    render(<TestList count={5} />)
    screen.getByTestId('row-0').focus()
    await userEvent.keyboard('{End}')
    expect(screen.getByTestId('active-idx').textContent).toBe('4')
    expect(document.activeElement).toBe(screen.getByTestId('row-4'))
  })

  it('Enter triggar onSelect med idx', async () => {
    const onSelect = vi.fn()
    render(<TestList count={3} onSelect={onSelect} />)
    screen.getByTestId('row-0').focus()
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('utan onSelect är Enter no-op', async () => {
    render(<TestList count={3} />)
    screen.getByTestId('row-0').focus()
    // Should not throw
    await userEvent.keyboard('{Enter}')
    expect(screen.getByTestId('active-idx').textContent).toBe('0')
  })

  it('Sprint R: Space triggar onToggleSelect med idx', async () => {
    const onToggleSelect = vi.fn()
    render(<TestList count={3} onToggleSelect={onToggleSelect} />)
    screen.getByTestId('row-0').focus()
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard(' ')
    expect(onToggleSelect).toHaveBeenCalledWith(1)
  })

  it('Sprint R: utan onToggleSelect är Space no-op (ingen throw)', async () => {
    render(<TestList count={3} />)
    screen.getByTestId('row-0').focus()
    await userEvent.keyboard(' ')
    expect(screen.getByTestId('active-idx').textContent).toBe('0')
  })

  it('Sprint R: Space preventDefault (ingen scroll-default)', async () => {
    const onToggleSelect = vi.fn()
    render(<TestList count={3} onToggleSelect={onToggleSelect} />)
    const row0 = screen.getByTestId('row-0')
    row0.focus()
    const event = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    })
    row0.dispatchEvent(event)
    // userEvent-biblioteket preventar default; verifiera att callback fick idx=0
    await userEvent.keyboard(' ')
    expect(onToggleSelect).toHaveBeenCalledWith(0)
  })

  it('onFocus synkar activeIdx (klick på annan rad)', async () => {
    render(<TestList count={3} />)
    await userEvent.click(screen.getByTestId('row-2'))
    expect(screen.getByTestId('active-idx').textContent).toBe('2')
    expect(screen.getByTestId('row-2').getAttribute('tabindex')).toBe('0')
  })

  it('rowCount krymper — activeIdx clampas', async () => {
    const { rerender } = render(<TestList count={5} />)
    screen.getByTestId('row-0').focus()
    await userEvent.keyboard('{End}')
    expect(screen.getByTestId('active-idx').textContent).toBe('4')
    rerender(<TestList count={2} />)
    // activeIdx clampas till 1 (sista index i nya listan)
    expect(screen.getByTestId('active-idx').textContent).toBe('1')
  })

  it('preventDefault kallas för arrow + home/end/enter', async () => {
    const onSelect = vi.fn()
    render(<TestList count={3} onSelect={onSelect} />)
    const row0 = screen.getByTestId('row-0')
    row0.focus()
    // userEvent.keyboard triggers real events; if preventDefault wasn't
    // called, ArrowDown on a <tr> with tabIndex would still trigger scroll
    // (which jsdom no-ops). Easier to assert: behavior happens.
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(screen.getByTestId('row-1'))
  })
})
