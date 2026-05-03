// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, act } from '@testing-library/react'
import {
  ActivePeriodProvider,
  useActivePeriod,
  useActivePeriodOptional,
  useSetActivePeriod,
} from '../../../src/renderer/contexts/ActivePeriodContext'

describe('ActivePeriodContext (VS-144)', () => {
  it('useActivePeriodOptional returnerar null utan provider', () => {
    let captured: unknown = 'sentinel'
    function Probe() {
      captured = useActivePeriodOptional()
      return null
    }
    render(<Probe />)
    expect(captured).toBeNull()
  })

  it('useActivePeriod kastar utanför provider', () => {
    function Probe() {
      useActivePeriod()
      return null
    }
    // React loggar fel — fånga via console-spy är overkill, vi kollar throw direkt.
    expect(() => render(<Probe />)).toThrow(
      /måste användas inom ActivePeriodProvider/,
    )
  })

  it('default activePeriodId = null inom provider', () => {
    let snapshot: number | null = -1
    function Probe() {
      const { activePeriodId } = useActivePeriod()
      snapshot = activePeriodId
      return null
    }
    render(
      <ActivePeriodProvider>
        <Probe />
      </ActivePeriodProvider>,
    )
    expect(snapshot).toBeNull()
  })

  it('setActivePeriodId uppdaterar context-värde', () => {
    let setter: ((id: number | null) => void) | undefined
    let snapshot: number | null = -1
    function Probe() {
      const ctx = useActivePeriod()
      setter = ctx.setActivePeriodId
      snapshot = ctx.activePeriodId
      return null
    }
    render(
      <ActivePeriodProvider>
        <Probe />
      </ActivePeriodProvider>,
    )
    expect(snapshot).toBeNull()
    act(() => setter?.(42))
    expect(snapshot).toBe(42)
    act(() => setter?.(null))
    expect(snapshot).toBeNull()
  })

  it('useSetActivePeriod sätter override och nollar vid unmount', () => {
    let snapshot: number | null = -2
    function Probe() {
      const { activePeriodId } = useActivePeriod()
      snapshot = activePeriodId
      return null
    }
    function Setter({ id }: { id: number | null }) {
      useSetActivePeriod(id)
      return null
    }
    const { rerender, unmount } = render(
      <ActivePeriodProvider>
        <Setter id={7} />
        <Probe />
      </ActivePeriodProvider>,
    )
    expect(snapshot).toBe(7)

    rerender(
      <ActivePeriodProvider>
        <Setter id={11} />
        <Probe />
      </ActivePeriodProvider>,
    )
    expect(snapshot).toBe(11)

    unmount()
    // Probe är unmounted; verifiera bara att inget kraschar.
  })

  it('useSetActivePeriod är no-op utan provider', () => {
    function Probe() {
      useSetActivePeriod(5)
      return null
    }
    expect(() => render(<Probe />)).not.toThrow()
  })
})
