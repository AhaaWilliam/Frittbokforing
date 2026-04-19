// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SecuritySection } from '../../src/renderer/components/settings/SecuritySection'

function ok<T>(data: T) {
  return { success: true as const, data }
}
function fail(code: string, error: string) {
  return { success: false as const, code, error }
}

interface AuthMock {
  status: ReturnType<typeof vi.fn>
  changePassword: ReturnType<typeof vi.fn>
  rotateRecoveryKey: ReturnType<typeof vi.fn>
  setTimeout: ReturnType<typeof vi.fn>
  [key: string]: unknown
}

let auth: AuthMock

beforeEach(() => {
  auth = {
    status: vi.fn().mockResolvedValue(
      ok({
        locked: false,
        userId: '11111111-1111-1111-1111-111111111111',
        timeoutMs: 15 * 60 * 1000,
      }),
    ),
    changePassword: vi.fn(),
    rotateRecoveryKey: vi.fn(),
    setTimeout: vi.fn(),
  }
  ;(window as unknown as { auth: AuthMock }).auth = auth
})

describe('SecuritySection — change password', () => {
  it('submits old + new password to backend', async () => {
    const user = userEvent.setup()
    auth.changePassword.mockResolvedValue(ok({ ok: true }))
    render(<SecuritySection />)
    await user.type(
      await screen.findByTestId('settings-old-password'),
      'old-password-12345',
    )
    await user.type(
      screen.getByTestId('settings-new-password'),
      'new-password-67890',
    )
    await user.type(
      screen.getByTestId('settings-confirm-password'),
      'new-password-67890',
    )
    await user.click(screen.getByTestId('settings-change-password-submit'))
    await waitFor(() =>
      expect(auth.changePassword).toHaveBeenCalledWith({
        userId: '11111111-1111-1111-1111-111111111111',
        oldPassword: 'old-password-12345',
        newPassword: 'new-password-67890',
      }),
    )
    expect(
      await screen.findByTestId('settings-password-success'),
    ).toBeInTheDocument()
  })

  it('rejects when new and confirm do not match without calling backend', async () => {
    const user = userEvent.setup()
    render(<SecuritySection />)
    await user.type(
      await screen.findByTestId('settings-old-password'),
      'old-password-12345',
    )
    await user.type(
      screen.getByTestId('settings-new-password'),
      'new-password-67890',
    )
    await user.type(
      screen.getByTestId('settings-confirm-password'),
      'something-else-12345',
    )
    await user.click(screen.getByTestId('settings-change-password-submit'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/matchar inte/)
    expect(auth.changePassword).not.toHaveBeenCalled()
  })

  it('surfaces backend error (wrong old password)', async () => {
    const user = userEvent.setup()
    auth.changePassword.mockResolvedValue(
      fail('WRONG_PASSWORD', 'Gammalt lösenord matchar inte'),
    )
    render(<SecuritySection />)
    await user.type(
      await screen.findByTestId('settings-old-password'),
      'wrong',
    )
    await user.type(
      screen.getByTestId('settings-new-password'),
      'new-password-67890',
    )
    await user.type(
      screen.getByTestId('settings-confirm-password'),
      'new-password-67890',
    )
    await user.click(screen.getByTestId('settings-change-password-submit'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/matchar inte/)
  })

  it('surfaces weak-password error from backend', async () => {
    const user = userEvent.setup()
    auth.changePassword.mockResolvedValue(
      fail('WEAK_PASSWORD', 'Lösenordet måste vara minst 12 tecken'),
    )
    render(<SecuritySection />)
    await user.type(
      await screen.findByTestId('settings-old-password'),
      'old-password-12345',
    )
    await user.type(screen.getByTestId('settings-new-password'), 'short')
    await user.type(screen.getByTestId('settings-confirm-password'), 'short')
    await user.click(screen.getByTestId('settings-change-password-submit'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/12 tecken/)
  })
})

describe('SecuritySection — rotate recovery key', () => {
  it('requires confirmation step before generating', async () => {
    const user = userEvent.setup()
    render(<SecuritySection />)
    await user.click(await screen.findByTestId('settings-rotate-open'))
    expect(screen.getByTestId('settings-rotate-confirm')).toBeInTheDocument()
    expect(auth.rotateRecoveryKey).not.toHaveBeenCalled()
  })

  it('shows new phrase and requires checkbox before dismissing', async () => {
    const user = userEvent.setup()
    auth.rotateRecoveryKey.mockResolvedValue(
      ok({ recoveryKey: 'word '.repeat(24).trim() }),
    )
    render(<SecuritySection />)
    await user.click(await screen.findByTestId('settings-rotate-open'))
    await user.click(screen.getByTestId('settings-rotate-confirm'))

    const phrase = await screen.findByTestId('settings-rotate-phrase')
    expect(phrase).toHaveTextContent(/word/)
    const doneBtn = screen.getByTestId('settings-rotate-done')
    expect(doneBtn).toBeDisabled()

    await user.click(screen.getByTestId('settings-rotate-confirmed'))
    expect(doneBtn).toBeEnabled()
    await user.click(doneBtn)

    // After dismiss, back to initial state
    expect(
      screen.getByTestId('settings-rotate-open'),
    ).toBeInTheDocument()
  })

  it('surfaces NOT_AUTHENTICATED error if keystore got locked', async () => {
    const user = userEvent.setup()
    auth.rotateRecoveryKey.mockResolvedValue(
      fail('NOT_AUTHENTICATED', 'Du måste vara inloggad'),
    )
    render(<SecuritySection />)
    await user.click(await screen.findByTestId('settings-rotate-open'))
    await user.click(screen.getByTestId('settings-rotate-confirm'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/inloggad/)
  })
})

describe('SecuritySection — auto-lock timeout', () => {
  it('loads the current timeout from status and displays minutes', async () => {
    render(<SecuritySection />)
    const input = (await screen.findByTestId(
      'settings-auto-lock-minutes',
    )) as HTMLInputElement
    expect(input.value).toBe('15')
  })

  it('saves a new value to backend', async () => {
    const user = userEvent.setup()
    auth.setTimeout.mockResolvedValue(ok({ ok: true, timeoutMs: 5 * 60_000 }))
    render(<SecuritySection />)
    const input = (await screen.findByTestId(
      'settings-auto-lock-minutes',
    )) as HTMLInputElement
    await user.clear(input)
    await user.type(input, '5')
    await user.click(screen.getByTestId('settings-auto-lock-save'))
    await waitFor(() =>
      expect(auth.setTimeout).toHaveBeenCalledWith({
        timeoutMs: 5 * 60_000,
      }),
    )
    expect(
      await screen.findByTestId('settings-auto-lock-saved'),
    ).toBeInTheDocument()
  })

  it('rejects out-of-range values client-side', async () => {
    const user = userEvent.setup()
    render(<SecuritySection />)
    const input = (await screen.findByTestId(
      'settings-auto-lock-minutes',
    )) as HTMLInputElement
    await user.clear(input)
    await user.type(input, '9999')
    await user.click(screen.getByTestId('settings-auto-lock-save'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/1 och 1440/)
    expect(auth.setTimeout).not.toHaveBeenCalled()
  })

  it('save button disabled when value equals saved value', async () => {
    render(<SecuritySection />)
    const save = (await screen.findByTestId(
      'settings-auto-lock-save',
    )) as HTMLButtonElement
    expect(save).toBeDisabled()
  })
})
