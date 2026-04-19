// @vitest-environment jsdom
/**
 * LockScreen unit tests. Mocks `window.auth` directly — the lock screen runs
 * before the rest of the app is wired, so the real IPC mock (mock-ipc.ts) is
 * not in use here.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LockScreen } from '../../../src/renderer/pages/LockScreen'
import type { UserMeta } from '../../../src/renderer/electron'

function ok<T>(data: T) {
  return { success: true as const, data }
}
function fail(code: string, error: string) {
  return { success: false as const, code, error }
}

interface AuthMock {
  listUsers: ReturnType<typeof vi.fn>
  status: ReturnType<typeof vi.fn>
  createUser: ReturnType<typeof vi.fn>
  login: ReturnType<typeof vi.fn>
  loginWithRecovery: ReturnType<typeof vi.fn>
  logout: ReturnType<typeof vi.fn>
  changePassword: ReturnType<typeof vi.fn>
  rotateRecoveryKey: ReturnType<typeof vi.fn>
  renameUser: ReturnType<typeof vi.fn>
  deleteUser: ReturnType<typeof vi.fn>
  touch: ReturnType<typeof vi.fn>
  legacyCheck: ReturnType<typeof vi.fn>
  legacyImport: ReturnType<typeof vi.fn>
  legacySkip: ReturnType<typeof vi.fn>
}

let auth: AuthMock
let onUnlocked: ((user: UserMeta) => void) & { mock: { calls: unknown[][] } }

function makeUser(over?: Partial<UserMeta>): UserMeta {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    displayName: 'Alice',
    createdAt: '2026-04-19T10:00:00.000Z',
    ...over,
  }
}

beforeEach(() => {
  auth = {
    listUsers: vi.fn().mockResolvedValue(ok([])),
    status: vi.fn(),
    createUser: vi.fn(),
    login: vi.fn(),
    loginWithRecovery: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
    rotateRecoveryKey: vi.fn(),
    renameUser: vi.fn(),
    deleteUser: vi.fn(),
    touch: vi.fn(),
    legacyCheck: vi.fn().mockResolvedValue(ok({ exists: false, path: null })),
    legacyImport: vi.fn(),
    legacySkip: vi.fn(),
  }
  vi.stubGlobal('auth', auth)
  // LockScreen reads from window.auth
  ;(window as unknown as { auth: AuthMock }).auth = auth
  onUnlocked = vi.fn() as typeof onUnlocked
})

describe('LockScreen — empty state', () => {
  it('goes straight to create-form when no users exist', async () => {
    auth.listUsers.mockResolvedValue(ok([]))
    render(<LockScreen onUnlocked={onUnlocked} />)
    await screen.findByTestId('lockscreen-name')
    expect(screen.getByText(/Skapa en ny användare/)).toBeInTheDocument()
  })

  it('empty-state create form has no cancel button', async () => {
    auth.listUsers.mockResolvedValue(ok([]))
    render(<LockScreen onUnlocked={onUnlocked} />)
    await screen.findByTestId('lockscreen-name')
    expect(screen.queryByRole('button', { name: /Avbryt/ })).toBeNull()
  })
})

describe('LockScreen — user list', () => {
  it('lists users when one or more exist', async () => {
    auth.listUsers.mockResolvedValue(
      ok([makeUser({ displayName: 'Alice' }), makeUser({ id: '22222222-2222-2222-2222-222222222222', displayName: 'Bob' })]),
    )
    render(<LockScreen onUnlocked={onUnlocked} />)
    await screen.findByRole('button', { name: 'Alice' })
    expect(screen.getByRole('button', { name: 'Bob' })).toBeInTheDocument()
  })

  it('clicking a user transitions to login form', async () => {
    const user = userEvent.setup()
    auth.listUsers.mockResolvedValue(ok([makeUser()]))
    render(<LockScreen onUnlocked={onUnlocked} />)
    await user.click(await screen.findByRole('button', { name: 'Alice' }))
    expect(screen.getByTestId('lockscreen-password')).toBeInTheDocument()
  })

  it('"Skapa ny användare" transitions to create form with cancel available', async () => {
    const user = userEvent.setup()
    auth.listUsers.mockResolvedValue(ok([makeUser()]))
    render(<LockScreen onUnlocked={onUnlocked} />)
    await user.click(
      await screen.findByRole('button', { name: /Skapa ny användare/ }),
    )
    expect(screen.getByTestId('lockscreen-name')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Avbryt/ }),
    ).toBeInTheDocument()
  })
})

describe('LockScreen — login flow', () => {
  it('successful login calls onUnlocked with the user', async () => {
    const user = userEvent.setup()
    const alice = makeUser()
    auth.listUsers.mockResolvedValue(ok([alice]))
    auth.login.mockResolvedValue(ok({ user: alice }))
    render(<LockScreen onUnlocked={onUnlocked} />)
    await user.click(await screen.findByRole('button', { name: 'Alice' }))
    await user.type(screen.getByTestId('lockscreen-password'), 'hunter2')
    await user.click(screen.getByTestId('lockscreen-submit'))
    await waitFor(() => expect(onUnlocked).toHaveBeenCalledWith(alice))
    expect(auth.login).toHaveBeenCalledWith({
      userId: alice.id,
      password: 'hunter2',
    })
  })

  it('wrong password shows error and does not call onUnlocked', async () => {
    const user = userEvent.setup()
    auth.listUsers.mockResolvedValue(ok([makeUser()]))
    auth.login.mockResolvedValue(fail('WRONG_PASSWORD', 'Fel lösenord'))
    render(<LockScreen onUnlocked={onUnlocked} />)
    await user.click(await screen.findByRole('button', { name: 'Alice' }))
    await user.type(screen.getByTestId('lockscreen-password'), 'wrong')
    await user.click(screen.getByTestId('lockscreen-submit'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Fel lösenord')
    expect(onUnlocked).not.toHaveBeenCalled()
  })

  it('rate-limit error is surfaced', async () => {
    const user = userEvent.setup()
    auth.listUsers.mockResolvedValue(ok([makeUser()]))
    auth.login.mockResolvedValue(fail('RATE_LIMITED', 'För många försök — vänta 4s'))
    render(<LockScreen onUnlocked={onUnlocked} />)
    await user.click(await screen.findByRole('button', { name: 'Alice' }))
    await user.type(screen.getByTestId('lockscreen-password'), 'x')
    await user.click(screen.getByTestId('lockscreen-submit'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/vänta 4s/)
  })

  it('"Tillbaka" returns to user list', async () => {
    const user = userEvent.setup()
    auth.listUsers.mockResolvedValue(ok([makeUser()]))
    render(<LockScreen onUnlocked={onUnlocked} />)
    await user.click(await screen.findByRole('button', { name: 'Alice' }))
    await user.click(screen.getByRole('button', { name: /Tillbaka/ }))
    expect(screen.getByRole('button', { name: 'Alice' })).toBeInTheDocument()
  })
})

describe('LockScreen — recovery flow', () => {
  it('"Glömt lösenord" transitions to recovery form', async () => {
    const user = userEvent.setup()
    auth.listUsers.mockResolvedValue(ok([makeUser()]))
    render(<LockScreen onUnlocked={onUnlocked} />)
    await user.click(await screen.findByRole('button', { name: 'Alice' }))
    await user.click(screen.getByRole('button', { name: /Glömt lösenord/ }))
    expect(
      screen.getByTestId('lockscreen-recovery-phrase'),
    ).toBeInTheDocument()
  })

  it('successful recovery login calls onUnlocked', async () => {
    const user = userEvent.setup()
    const alice = makeUser()
    auth.listUsers.mockResolvedValue(ok([alice]))
    auth.loginWithRecovery.mockResolvedValue(ok({ user: alice }))
    render(<LockScreen onUnlocked={onUnlocked} />)
    await user.click(await screen.findByRole('button', { name: 'Alice' }))
    await user.click(screen.getByRole('button', { name: /Glömt lösenord/ }))
    await user.type(
      screen.getByTestId('lockscreen-recovery-phrase'),
      'abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across act action actor actress actual',
    )
    await user.click(screen.getByRole('button', { name: /Lås upp/ }))
    await waitFor(() => expect(onUnlocked).toHaveBeenCalledWith(alice))
  })

  it('wrong recovery phrase shows error', async () => {
    const user = userEvent.setup()
    auth.listUsers.mockResolvedValue(ok([makeUser()]))
    auth.loginWithRecovery.mockResolvedValue(
      fail('WRONG_RECOVERY_KEY', 'Återställningsfrasen matchar inte'),
    )
    render(<LockScreen onUnlocked={onUnlocked} />)
    await user.click(await screen.findByRole('button', { name: 'Alice' }))
    await user.click(screen.getByRole('button', { name: /Glömt lösenord/ }))
    await user.type(
      screen.getByTestId('lockscreen-recovery-phrase'),
      'not actually valid',
    )
    await user.click(screen.getByRole('button', { name: /Lås upp/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/matchar inte/)
  })
})

describe('LockScreen — create flow', () => {
  it('successful creation shows recovery key, requires confirmation', async () => {
    const user = userEvent.setup()
    const alice = makeUser()
    auth.listUsers.mockResolvedValue(ok([]))
    auth.createUser.mockResolvedValue(
      ok({ user: alice, recoveryKey: 'word '.repeat(24).trim() }),
    )
    render(<LockScreen onUnlocked={onUnlocked} />)
    await user.type(await screen.findByTestId('lockscreen-name'), 'Alice')
    await user.type(
      screen.getByTestId('lockscreen-new-password'),
      'super-secret-password-123',
    )
    await user.type(
      screen.getByTestId('lockscreen-confirm-password'),
      'super-secret-password-123',
    )
    await user.click(screen.getByTestId('lockscreen-create-submit'))
    const recovery = await screen.findByTestId('lockscreen-recovery-key')
    expect(within(recovery).getByText(/word/)).toBeInTheDocument()
    // Continue is disabled until confirmed
    const continueBtn = screen.getByTestId('lockscreen-recovery-continue')
    expect(continueBtn).toBeDisabled()
    await user.click(screen.getByTestId('lockscreen-recovery-confirmed'))
    expect(continueBtn).toBeEnabled()
    await user.click(continueBtn)
    expect(onUnlocked).toHaveBeenCalledWith(alice)
  })

  it('mismatched passwords shows error without calling createUser', async () => {
    const user = userEvent.setup()
    auth.listUsers.mockResolvedValue(ok([]))
    render(<LockScreen onUnlocked={onUnlocked} />)
    await user.type(await screen.findByTestId('lockscreen-name'), 'Alice')
    await user.type(
      screen.getByTestId('lockscreen-new-password'),
      'password-one-12345',
    )
    await user.type(
      screen.getByTestId('lockscreen-confirm-password'),
      'password-two-67890',
    )
    await user.click(screen.getByTestId('lockscreen-create-submit'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/matchar inte/)
    expect(auth.createUser).not.toHaveBeenCalled()
  })

  it('weak password error from backend is surfaced', async () => {
    const user = userEvent.setup()
    auth.listUsers.mockResolvedValue(ok([]))
    auth.createUser.mockResolvedValue(
      fail('WEAK_PASSWORD', 'Lösenordet måste vara minst 12 tecken'),
    )
    render(<LockScreen onUnlocked={onUnlocked} />)
    await user.type(await screen.findByTestId('lockscreen-name'), 'Alice')
    await user.type(screen.getByTestId('lockscreen-new-password'), 'short')
    await user.type(screen.getByTestId('lockscreen-confirm-password'), 'short')
    await user.click(screen.getByTestId('lockscreen-create-submit'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/12 tecken/)
  })
})

describe('LockScreen — legacy migration prompt', () => {
  it('shows legacy prompt after recovery-key display when legacy DB exists', async () => {
    const user = userEvent.setup()
    const alice = makeUser()
    auth.listUsers.mockResolvedValue(ok([]))
    auth.createUser.mockResolvedValue(
      ok({ user: alice, recoveryKey: 'word '.repeat(24).trim() }),
    )
    auth.legacyCheck.mockResolvedValue(
      ok({ exists: true, path: '/docs/Fritt Bokföring/data.db' }),
    )

    render(<LockScreen onUnlocked={onUnlocked} />)
    await user.type(await screen.findByTestId('lockscreen-name'), 'Alice')
    await user.type(
      screen.getByTestId('lockscreen-new-password'),
      'super-secret-password-123',
    )
    await user.type(
      screen.getByTestId('lockscreen-confirm-password'),
      'super-secret-password-123',
    )
    await user.click(screen.getByTestId('lockscreen-create-submit'))
    await user.click(await screen.findByTestId('lockscreen-recovery-confirmed'))
    await user.click(screen.getByTestId('lockscreen-recovery-continue'))

    // Legacy prompt appears
    expect(
      await screen.findByTestId('lockscreen-legacy-import'),
    ).toBeInTheDocument()
    expect(onUnlocked).not.toHaveBeenCalled()
  })

  it('skips legacy prompt entirely when no legacy DB exists', async () => {
    const user = userEvent.setup()
    const alice = makeUser()
    auth.listUsers.mockResolvedValue(ok([]))
    auth.createUser.mockResolvedValue(
      ok({ user: alice, recoveryKey: 'word '.repeat(24).trim() }),
    )
    auth.legacyCheck.mockResolvedValue(ok({ exists: false, path: null }))

    render(<LockScreen onUnlocked={onUnlocked} />)
    await user.type(await screen.findByTestId('lockscreen-name'), 'Alice')
    await user.type(
      screen.getByTestId('lockscreen-new-password'),
      'super-secret-password-123',
    )
    await user.type(
      screen.getByTestId('lockscreen-confirm-password'),
      'super-secret-password-123',
    )
    await user.click(screen.getByTestId('lockscreen-create-submit'))
    await user.click(await screen.findByTestId('lockscreen-recovery-confirmed'))
    await user.click(screen.getByTestId('lockscreen-recovery-continue'))

    await waitFor(() => expect(onUnlocked).toHaveBeenCalled())
    expect(auth.legacyImport).not.toHaveBeenCalled()
    expect(auth.legacySkip).not.toHaveBeenCalled()
  })

  it('import success archives and continues to unlocked state', async () => {
    const user = userEvent.setup()
    const alice = makeUser()
    auth.listUsers.mockResolvedValue(ok([]))
    auth.createUser.mockResolvedValue(
      ok({ user: alice, recoveryKey: 'word '.repeat(24).trim() }),
    )
    auth.legacyCheck.mockResolvedValue(
      ok({ exists: true, path: '/docs/Fritt Bokföring/data.db' }),
    )
    auth.legacyImport.mockResolvedValue(
      ok({ ok: true, archivedTo: '/vault/u1/backups/pre-encryption-X' }),
    )

    render(<LockScreen onUnlocked={onUnlocked} />)
    await user.type(await screen.findByTestId('lockscreen-name'), 'Alice')
    await user.type(
      screen.getByTestId('lockscreen-new-password'),
      'super-secret-password-123',
    )
    await user.type(
      screen.getByTestId('lockscreen-confirm-password'),
      'super-secret-password-123',
    )
    await user.click(screen.getByTestId('lockscreen-create-submit'))
    await user.click(await screen.findByTestId('lockscreen-recovery-confirmed'))
    await user.click(screen.getByTestId('lockscreen-recovery-continue'))
    await user.click(await screen.findByTestId('lockscreen-legacy-import'))

    expect(
      await screen.findByTestId('lockscreen-legacy-archive-path'),
    ).toHaveTextContent('pre-encryption-X')
    await user.click(screen.getByTestId('lockscreen-legacy-continue'))
    expect(onUnlocked).toHaveBeenCalledWith(alice)
  })

  it('skip archives legacy without importing and continues', async () => {
    const user = userEvent.setup()
    const alice = makeUser()
    auth.listUsers.mockResolvedValue(ok([]))
    auth.createUser.mockResolvedValue(
      ok({ user: alice, recoveryKey: 'word '.repeat(24).trim() }),
    )
    auth.legacyCheck.mockResolvedValue(
      ok({ exists: true, path: '/docs/Fritt Bokföring/data.db' }),
    )
    auth.legacySkip.mockResolvedValue(
      ok({ ok: true, archivedTo: '/vault/u1/backups/pre-encryption-Y' }),
    )

    render(<LockScreen onUnlocked={onUnlocked} />)
    await user.type(await screen.findByTestId('lockscreen-name'), 'Alice')
    await user.type(
      screen.getByTestId('lockscreen-new-password'),
      'super-secret-password-123',
    )
    await user.type(
      screen.getByTestId('lockscreen-confirm-password'),
      'super-secret-password-123',
    )
    await user.click(screen.getByTestId('lockscreen-create-submit'))
    await user.click(await screen.findByTestId('lockscreen-recovery-confirmed'))
    await user.click(screen.getByTestId('lockscreen-recovery-continue'))
    await user.click(await screen.findByTestId('lockscreen-legacy-skip'))

    await waitFor(() => expect(onUnlocked).toHaveBeenCalledWith(alice))
    expect(auth.legacySkip).toHaveBeenCalled()
    expect(auth.legacyImport).not.toHaveBeenCalled()
  })

  it('import failure surfaces error and returns to prompt', async () => {
    const user = userEvent.setup()
    const alice = makeUser()
    auth.listUsers.mockResolvedValue(ok([]))
    auth.createUser.mockResolvedValue(
      ok({ user: alice, recoveryKey: 'word '.repeat(24).trim() }),
    )
    auth.legacyCheck.mockResolvedValue(
      ok({ exists: true, path: '/docs/Fritt Bokföring/data.db' }),
    )
    auth.legacyImport.mockResolvedValue(
      fail('UNEXPECTED_ERROR', 'disk full'),
    )

    render(<LockScreen onUnlocked={onUnlocked} />)
    await user.type(await screen.findByTestId('lockscreen-name'), 'Alice')
    await user.type(
      screen.getByTestId('lockscreen-new-password'),
      'super-secret-password-123',
    )
    await user.type(
      screen.getByTestId('lockscreen-confirm-password'),
      'super-secret-password-123',
    )
    await user.click(screen.getByTestId('lockscreen-create-submit'))
    await user.click(await screen.findByTestId('lockscreen-recovery-confirmed'))
    await user.click(screen.getByTestId('lockscreen-recovery-continue'))
    await user.click(await screen.findByTestId('lockscreen-legacy-import'))

    expect(await screen.findByRole('alert')).toHaveTextContent(/disk full/)
    // Prompt buttons are visible again
    expect(screen.getByTestId('lockscreen-legacy-skip')).toBeInTheDocument()
    expect(onUnlocked).not.toHaveBeenCalled()
  })
})

describe('LockScreen — error from listUsers', () => {
  it('shows error if listUsers fails', async () => {
    auth.listUsers.mockResolvedValue(fail('UNEXPECTED_ERROR', 'fs broken'))
    render(<LockScreen onUnlocked={onUnlocked} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/fs broken/)
  })
})
