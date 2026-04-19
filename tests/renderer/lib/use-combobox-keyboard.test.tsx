// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useComboboxKeyboard } from '../../../src/renderer/lib/use-combobox-keyboard'
import type { KeyboardEvent } from 'react'

type Customer = { id: number; name: string }

function makeEvent(key: string): KeyboardEvent<HTMLInputElement> {
  return {
    key,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent<HTMLInputElement>
}

function setup(
  overrides: Partial<Parameters<typeof useComboboxKeyboard<Customer>>[0]> = {},
) {
  const items: Customer[] = [
    { id: 1, name: 'Alpha' },
    { id: 2, name: 'Beta' },
    { id: 3, name: 'Gamma' },
  ]
  const onSelect = vi.fn()
  const onClose = vi.fn()
  const trailingActivate = vi.fn()
  const hook = renderHook(
    (props: Parameters<typeof useComboboxKeyboard<Customer>>[0]) =>
      useComboboxKeyboard(props),
    {
      initialProps: {
        items,
        isOpen: true,
        onSelect,
        onClose,
        getItemId: (_: Customer, i: number) => `opt-${i}`,
        ...overrides,
      },
    },
  )
  return { hook, items, onSelect, onClose, trailingActivate }
}

describe('useComboboxKeyboard', () => {
  it('initialt: activeIndex = -1, activeId = undefined', () => {
    const { hook } = setup()
    expect(hook.result.current.activeIndex).toBe(-1)
    expect(hook.result.current.activeId).toBeUndefined()
  })

  it('ArrowDown cyklisk framåt från -1', () => {
    const { hook } = setup()
    act(() => hook.result.current.handleKeyDown(makeEvent('ArrowDown')))
    expect(hook.result.current.activeIndex).toBe(0)
    act(() => hook.result.current.handleKeyDown(makeEvent('ArrowDown')))
    expect(hook.result.current.activeIndex).toBe(1)
    act(() => hook.result.current.handleKeyDown(makeEvent('ArrowDown')))
    expect(hook.result.current.activeIndex).toBe(2)
    act(() => hook.result.current.handleKeyDown(makeEvent('ArrowDown')))
    expect(hook.result.current.activeIndex).toBe(0) // wrap
  })

  it('ArrowUp cyklisk bakåt från -1 (hoppar till sista)', () => {
    const { hook } = setup()
    act(() => hook.result.current.handleKeyDown(makeEvent('ArrowUp')))
    expect(hook.result.current.activeIndex).toBe(2)
  })

  it('Home → index 0, End → sista', () => {
    const { hook } = setup()
    act(() => hook.result.current.handleKeyDown(makeEvent('End')))
    expect(hook.result.current.activeIndex).toBe(2)
    act(() => hook.result.current.handleKeyDown(makeEvent('Home')))
    expect(hook.result.current.activeIndex).toBe(0)
  })

  it('Enter aktiverar option och anropar onSelect', () => {
    const { hook, items, onSelect } = setup()
    act(() => hook.result.current.handleKeyDown(makeEvent('ArrowDown')))
    act(() => hook.result.current.handleKeyDown(makeEvent('Enter')))
    expect(onSelect).toHaveBeenCalledWith(items[0])
  })

  it('Enter utan aktiv selection gör ingenting', () => {
    const { hook, onSelect } = setup()
    act(() => hook.result.current.handleKeyDown(makeEvent('Enter')))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('Escape anropar onClose + nollställer activeIndex', () => {
    const { hook, onClose } = setup()
    act(() => hook.result.current.handleKeyDown(makeEvent('ArrowDown')))
    act(() => hook.result.current.handleKeyDown(makeEvent('Escape')))
    expect(onClose).toHaveBeenCalled()
    expect(hook.result.current.activeIndex).toBe(-1)
  })

  it('Tangentbord ignoreras när isOpen=false (utom Escape)', () => {
    const onSelect = vi.fn()
    const { hook } = setup({ isOpen: false, onSelect })
    act(() => hook.result.current.handleKeyDown(makeEvent('ArrowDown')))
    expect(hook.result.current.activeIndex).toBe(-1)
  })

  it('trailingAction: sista index aktiverar trailing onActivate', () => {
    const onSelect = vi.fn()
    const trailingActivate = vi.fn()
    const { hook } = setup({
      onSelect,
      trailingAction: { id: 'create-new', onActivate: trailingActivate },
    })
    // 3 options + 1 trailing = 4 slots
    act(() => hook.result.current.handleKeyDown(makeEvent('End')))
    expect(hook.result.current.activeIndex).toBe(3)
    expect(hook.result.current.activeId).toBe('create-new')
    expect(hook.result.current.isTrailingActive()).toBe(true)

    act(() => hook.result.current.handleKeyDown(makeEvent('Enter')))
    expect(trailingActivate).toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('activeId matchar getItemId för aktuell option', () => {
    const { hook } = setup()
    act(() => hook.result.current.handleKeyDown(makeEvent('ArrowDown')))
    expect(hook.result.current.activeId).toBe('opt-0')
    act(() => hook.result.current.handleKeyDown(makeEvent('ArrowDown')))
    expect(hook.result.current.activeId).toBe('opt-1')
  })

  it('Tom lista: ingen nav möjlig', () => {
    const { hook } = setup({ items: [] })
    act(() => hook.result.current.handleKeyDown(makeEvent('ArrowDown')))
    expect(hook.result.current.activeIndex).toBe(-1)
  })

  it('isOpen=false → activeIndex nollställs', () => {
    const { hook } = setup()
    act(() => hook.result.current.handleKeyDown(makeEvent('ArrowDown')))
    expect(hook.result.current.activeIndex).toBe(0)
    hook.rerender({
      items: [
        { id: 1, name: 'Alpha' },
        { id: 2, name: 'Beta' },
        { id: 3, name: 'Gamma' },
      ],
      isOpen: false,
      onSelect: vi.fn(),
      onClose: vi.fn(),
      getItemId: (_, i) => `opt-${i}`,
    })
    expect(hook.result.current.activeIndex).toBe(-1)
  })

  it('items krymper under navigation → activeIndex clampas', () => {
    const { hook } = setup()
    act(() => hook.result.current.handleKeyDown(makeEvent('End'))) // index 2
    expect(hook.result.current.activeIndex).toBe(2)
    hook.rerender({
      items: [{ id: 1, name: 'Alpha' }], // bara 1 kvar
      isOpen: true,
      onSelect: vi.fn(),
      onClose: vi.fn(),
      getItemId: (_, i) => `opt-${i}`,
    })
    expect(hook.result.current.activeIndex).toBe(-1)
  })
})
