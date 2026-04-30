// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppTopBar } from '../../../../src/renderer/components/layout/AppTopBar'

describe('AppTopBar', () => {
  let setSettingMock: ReturnType<typeof vi.fn>
  let getSettingMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    setSettingMock = vi.fn().mockResolvedValue(undefined)
    getSettingMock = vi.fn().mockResolvedValue('bokforare')
    ;(window as unknown as { api: unknown }).api = {
      getSetting: getSettingMock,
      setSetting: setSettingMock,
    }
  })

  afterEach(() => {
    delete (window as unknown as { api?: unknown }).api
  })

  it('renders italic Fritt brand + company name', () => {
    render(<AppTopBar companyName="Acme AB" />)
    expect(screen.getByText('Fritt')).toBeInTheDocument()
    expect(screen.getByText('Acme AB')).toBeInTheDocument()
  })

  it('renders mode-toggle button', () => {
    render(<AppTopBar companyName="X" />)
    // Default mode efter useUiMode-init = 'bokforare', knappen visar Vardag-läge
    const button = screen.getByRole('button', { name: /Byt till/ })
    expect(button).toBeInTheDocument()
  })

  it('renders ⌘⇧B kbd-chip in mode-toggle', () => {
    render(<AppTopBar companyName="X" />)
    expect(screen.getByText('⌘⇧B')).toBeInTheDocument()
  })

  it('mode-toggle calls setSetting on click', async () => {
    render(<AppTopBar companyName="X" />)
    const button = await screen.findByTestId('switch-to-vardag')
    await userEvent.click(button)
    expect(setSettingMock).toHaveBeenCalledWith('ui_mode', 'vardag')
  })

  it('renders without FiscalYearProvider (graceful)', () => {
    // useFiscalYearContextOptional returnerar null när provider saknas;
    // periodLabel ska bara utelämnas, inte krascha.
    render(<AppTopBar companyName="X" />)
    expect(screen.queryByTestId('topbar-period')).not.toBeInTheDocument()
    expect(screen.getByTestId('app-top-bar')).toBeInTheDocument()
  })

  it('uses banner role', () => {
    render(<AppTopBar companyName="X" />)
    expect(screen.getByRole('banner')).toBeInTheDocument()
  })
})
