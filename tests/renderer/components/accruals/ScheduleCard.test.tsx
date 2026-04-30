// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScheduleCard } from '../../../../src/renderer/components/accruals/ScheduleCard'
import type { AccrualScheduleWithStatus } from '../../../../src/shared/types'

function makeSchedule(
  overrides?: Partial<AccrualScheduleWithStatus>,
): AccrualScheduleWithStatus {
  return {
    id: 1,
    fiscal_year_id: 1,
    description: 'Försäkring',
    accrual_type: 'cost',
    balance_account: '1700',
    result_account: '5000',
    total_amount_ore: 12000,
    period_count: 12,
    start_period: 1,
    is_active: 1,
    created_at: '2026-01-01',
    periodStatuses: Array.from({ length: 12 }, (_, i) => ({
      periodNumber: i + 1,
      executed: i < 3,
      amountOre: 1000,
    })),
    executedCount: 3,
    remainingOre: 9000,
    ...overrides,
  }
}

describe('ScheduleCard', () => {
  it('rendrar beskrivning och total-belopp', () => {
    render(
      <ScheduleCard
        schedule={makeSchedule({ description: 'Hyra Q1' })}
        onExecute={() => {}}
        onDeactivate={() => {}}
        isExecuting={false}
      />,
    )
    expect(screen.getByText('Hyra Q1')).toBeInTheDocument()
    // formatKr → "120 kr" eller "120 SEK" beroende på Intl-locale
    expect(screen.getByText(/120/)).toBeInTheDocument()
  })

  it('visar progress "3 av 12 perioder körda"', () => {
    render(
      <ScheduleCard
        schedule={makeSchedule()}
        onExecute={() => {}}
        onDeactivate={() => {}}
        isExecuting={false}
      />,
    )
    expect(screen.getByText(/3 av 12 perioder körda/)).toBeInTheDocument()
    expect(screen.getByText(/P1–P12/)).toBeInTheDocument()
  })

  it('Kör-knapp anropar onExecute med nästa pending period', async () => {
    const user = userEvent.setup()
    const onExecute = vi.fn()
    render(
      <ScheduleCard
        schedule={makeSchedule()}
        onExecute={onExecute}
        onDeactivate={() => {}}
        isExecuting={false}
      />,
    )
    await user.click(screen.getByRole('button', { name: /Kör P4/ }))
    expect(onExecute).toHaveBeenCalledWith(1, 4)
  })

  it('Avaktivera anropar onDeactivate med schedule-id', async () => {
    const user = userEvent.setup()
    const onDeactivate = vi.fn()
    render(
      <ScheduleCard
        schedule={makeSchedule()}
        onExecute={() => {}}
        onDeactivate={onDeactivate}
        isExecuting={false}
      />,
    )
    await user.click(screen.getByRole('button', { name: /Avaktivera/ }))
    expect(onDeactivate).toHaveBeenCalledWith(1)
  })

  it('isExecuting=true disablar Kör-knappen', () => {
    render(
      <ScheduleCard
        schedule={makeSchedule()}
        onExecute={() => {}}
        onDeactivate={() => {}}
        isExecuting={true}
      />,
    )
    expect(screen.getByRole('button', { name: /Kör P/ })).toBeDisabled()
  })

  it('is_active=0 döljer Kör/Avaktivera och visar "Inaktiv"', () => {
    render(
      <ScheduleCard
        schedule={makeSchedule({ is_active: 0 })}
        onExecute={() => {}}
        onDeactivate={() => {}}
        isExecuting={false}
      />,
    )
    expect(screen.queryByRole('button', { name: /Kör P/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Avaktivera/ })).not.toBeInTheDocument()
    expect(screen.getByText('Inaktiv')).toBeInTheDocument()
  })

  it('helt körd schedule döljer Kör-knapp men visar Avaktivera', () => {
    const fullySchedule = makeSchedule({
      executedCount: 12,
      remainingOre: 0,
      periodStatuses: Array.from({ length: 12 }, (_, i) => ({
        periodNumber: i + 1,
        executed: true,
        amountOre: 1000,
      })),
    })
    render(
      <ScheduleCard
        schedule={fullySchedule}
        onExecute={() => {}}
        onDeactivate={() => {}}
        isExecuting={false}
      />,
    )
    expect(screen.queryByRole('button', { name: /Kör P/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Avaktivera/ })).toBeInTheDocument()
  })
})
