import { useEffect, useState } from 'react'
import type { UserMeta } from '../electron'
import { Callout } from '../components/ui/Callout'

type Mode =
  | { kind: 'list' }
  | { kind: 'login'; user: UserMeta }
  | { kind: 'create' }
  | { kind: 'recovery'; user: UserMeta }
  | { kind: 'show-recovery-key'; user: UserMeta; phrase: string }
  | { kind: 'legacy-prompt'; user: UserMeta }
  | { kind: 'legacy-working'; user: UserMeta }
  | { kind: 'legacy-done'; user: UserMeta; archivedTo: string | null }

interface Props {
  /** Called after successful login or user-creation. */
  onUnlocked: (user: UserMeta) => void
}

export function LockScreen({ onUnlocked }: Props) {
  const [mode, setMode] = useState<Mode>({ kind: 'list' })
  const [users, setUsers] = useState<UserMeta[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.auth.listUsers().then((res) => {
      if (cancelled) return
      if (res.success) {
        setUsers(res.data)
        if (res.data.length === 0) setMode({ kind: 'create' })
      } else {
        setError(res.error)
        setUsers([]) // break out of loading state so the error is visible
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (users === null && mode.kind !== 'create') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center text-muted-foreground"
      >
        Laddar…
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-lg">
        <h1 className="mb-4 text-xl font-semibold">Fritt Bokföring</h1>

        {error && (
          <div className="mb-3">
            <Callout variant="danger">{error}</Callout>
          </div>
        )}

        {mode.kind === 'list' && (
          <UserList
            users={users ?? []}
            onSelect={(user) => {
              setError(null)
              setMode({ kind: 'login', user })
            }}
            onCreate={() => {
              setError(null)
              setMode({ kind: 'create' })
            }}
          />
        )}

        {mode.kind === 'login' && (
          <LoginForm
            user={mode.user}
            onCancel={() => setMode({ kind: 'list' })}
            onForgot={() => setMode({ kind: 'recovery', user: mode.user })}
            onSuccess={onUnlocked}
            onError={setError}
          />
        )}

        {mode.kind === 'recovery' && (
          <RecoveryForm
            user={mode.user}
            onCancel={() => setMode({ kind: 'login', user: mode.user })}
            onSuccess={onUnlocked}
            onError={setError}
          />
        )}

        {mode.kind === 'create' && (
          <CreateForm
            onCancel={
              users && users.length > 0
                ? () => setMode({ kind: 'list' })
                : undefined
            }
            onCreated={(user, phrase) =>
              setMode({ kind: 'show-recovery-key', user, phrase })
            }
            onError={setError}
          />
        )}

        {mode.kind === 'show-recovery-key' && (
          <RecoveryKeyDisplay
            phrase={mode.phrase}
            onConfirm={async () => {
              // After acknowledging the recovery key, check for legacy DB.
              const res = await window.auth.legacyCheck()
              if (res.success && res.data.exists) {
                setMode({ kind: 'legacy-prompt', user: mode.user })
              } else {
                onUnlocked(mode.user)
              }
            }}
          />
        )}

        {mode.kind === 'legacy-prompt' && (
          <LegacyPrompt
            onImport={() =>
              setMode({ kind: 'legacy-working', user: mode.user })
            }
            onSkip={async () => {
              setError(null)
              const res = await window.auth.legacySkip()
              if (!res.success) {
                setError(res.error)
                return
              }
              onUnlocked(mode.user)
            }}
          />
        )}

        {mode.kind === 'legacy-working' && (
          <LegacyWorking
            onDone={(archivedTo) =>
              setMode({ kind: 'legacy-done', user: mode.user, archivedTo })
            }
            onError={(msg) => {
              setError(msg)
              setMode({ kind: 'legacy-prompt', user: mode.user })
            }}
          />
        )}

        {mode.kind === 'legacy-done' && (
          <LegacyDone
            archivedTo={mode.archivedTo}
            onContinue={() => onUnlocked(mode.user)}
          />
        )}
      </div>
    </div>
  )
}

function UserList({
  users,
  onSelect,
  onCreate,
}: {
  users: UserMeta[]
  onSelect: (u: UserMeta) => void
  onCreate: () => void
}) {
  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">Välj användare:</p>
      <ul className="mb-4 space-y-2">
        {users.map((u) => (
          <li key={u.id}>
            <button
              type="button"
              onClick={() => onSelect(u)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-left text-sm hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {u.displayName}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onCreate}
        className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary"
      >
        Skapa ny användare
      </button>
    </>
  )
}

function LoginForm({
  user,
  onCancel,
  onForgot,
  onSuccess,
  onError,
}: {
  user: UserMeta
  onCancel: () => void
  onForgot: () => void
  onSuccess: (user: UserMeta) => void
  onError: (msg: string) => void
}) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    onError('')
    const res = await window.auth.login({ userId: user.id, password })
    setBusy(false)
    if (res.success) {
      onSuccess(res.data.user)
    } else {
      onError(res.error)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <p className="mb-3 text-sm">
        Logga in som <strong>{user.displayName}</strong>
      </p>
      <label
        htmlFor="lockscreen-password"
        className="mb-1 block text-sm font-medium"
      >
        Lösenord
      </label>
      <input
        id="lockscreen-password"
        data-testid="lockscreen-password"
        type="password"
        autoFocus
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mb-4 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          Tillbaka
        </button>
        <button
          type="submit"
          disabled={busy || password.length === 0}
          data-testid="lockscreen-submit"
          className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? 'Loggar in…' : 'Logga in'}
        </button>
      </div>
      <button
        type="button"
        onClick={onForgot}
        className="mt-3 w-full text-center text-xs text-muted-foreground underline"
      >
        Glömt lösenord?
      </button>
    </form>
  )
}

function RecoveryForm({
  user,
  onCancel,
  onSuccess,
  onError,
}: {
  user: UserMeta
  onCancel: () => void
  onSuccess: (user: UserMeta) => void
  onError: (msg: string) => void
}) {
  const [phrase, setPhrase] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    onError('')
    const res = await window.auth.loginWithRecovery({
      userId: user.id,
      recoveryPhrase: phrase,
    })
    setBusy(false)
    if (res.success) {
      onSuccess(res.data.user)
    } else {
      onError(res.error)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <p className="mb-3 text-sm">
        Ange din återställningsfras (24 ord, separerade med mellanslag):
      </p>
      <textarea
        data-testid="lockscreen-recovery-phrase"
        autoFocus
        rows={4}
        value={phrase}
        onChange={(e) => setPhrase(e.target.value)}
        className="mb-4 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          Tillbaka
        </button>
        <button
          type="submit"
          disabled={busy || phrase.trim().length === 0}
          className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? 'Låser upp…' : 'Lås upp'}
        </button>
      </div>
    </form>
  )
}

function CreateForm({
  onCancel,
  onCreated,
  onError,
}: {
  onCancel?: () => void
  onCreated: (user: UserMeta, recoveryKey: string) => void
  onError: (msg: string) => void
}) {
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onError('')
    if (password !== confirm) {
      onError('Lösenorden matchar inte')
      return
    }
    setBusy(true)
    const res = await window.auth.createUser({ displayName, password })
    setBusy(false)
    if (res.success) {
      onCreated(res.data.user, res.data.recoveryKey)
    } else {
      onError(res.error)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <p className="mb-3 text-sm">Skapa en ny användare:</p>
      <label
        htmlFor="lockscreen-name"
        className="mb-1 block text-sm font-medium"
      >
        Namn
      </label>
      <input
        id="lockscreen-name"
        data-testid="lockscreen-name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        className="mb-3 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <label
        htmlFor="lockscreen-new-password"
        className="mb-1 block text-sm font-medium"
      >
        Lösenord (minst 12 tecken)
      </label>
      <input
        id="lockscreen-new-password"
        data-testid="lockscreen-new-password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mb-3 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <label
        htmlFor="lockscreen-confirm-password"
        className="mb-1 block text-sm font-medium"
      >
        Bekräfta lösenord
      </label>
      <input
        id="lockscreen-confirm-password"
        data-testid="lockscreen-confirm-password"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className="mb-4 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            Avbryt
          </button>
        )}
        <button
          type="submit"
          disabled={busy || displayName.trim().length === 0}
          data-testid="lockscreen-create-submit"
          className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? 'Skapar…' : 'Skapa'}
        </button>
      </div>
    </form>
  )
}

function LegacyPrompt({
  onImport,
  onSkip,
}: {
  onImport: () => void
  onSkip: () => void
}) {
  return (
    <div>
      <h2 className="mb-2 text-lg font-semibold">Importera befintlig data?</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Vi hittade en äldre okrypterad bokföringsdatabas på datorn. Vill du
        importera dess innehåll till din nya skyddade databas?
      </p>
      <p className="mb-4 text-xs text-muted-foreground">
        Originalet flyttas till din säkerhetskopie-mapp efter import — det
        raderas inte automatiskt.
      </p>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onImport}
          data-testid="lockscreen-legacy-import"
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          Importera
        </button>
        <button
          type="button"
          onClick={onSkip}
          data-testid="lockscreen-legacy-skip"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          Hoppa över — starta med tom databas
        </button>
      </div>
    </div>
  )
}

function LegacyWorking({
  onDone,
  onError,
}: {
  onDone: (archivedTo: string | null) => void
  onError: (msg: string) => void
}) {
  useEffect(() => {
    let cancelled = false
    window.auth.legacyImport().then((res) => {
      if (cancelled) return
      if (res.success) onDone(res.data.archivedTo)
      else onError(res.error)
    })
    return () => {
      cancelled = true
    }
  }, [onDone, onError])

  return (
    <div
      role="status"
      aria-live="polite"
      className="py-6 text-center text-sm text-muted-foreground"
    >
      Importerar data…
    </div>
  )
}

function LegacyDone({
  archivedTo,
  onContinue,
}: {
  archivedTo: string | null
  onContinue: () => void
}) {
  return (
    <div>
      <h2 className="mb-2 text-lg font-semibold">Import slutförd ✓</h2>
      <p className="mb-3 text-sm">
        Din befintliga data har importerats till den skyddade databasen.
      </p>
      {archivedTo && (
        <p className="mb-4 text-xs text-muted-foreground">
          Original arkiverat till:
          <br />
          <code
            data-testid="lockscreen-legacy-archive-path"
            className="break-all"
          >
            {archivedTo}
          </code>
        </p>
      )}
      <button
        type="button"
        onClick={onContinue}
        data-testid="lockscreen-legacy-continue"
        className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
      >
        Fortsätt
      </button>
    </div>
  )
}

function RecoveryKeyDisplay({
  phrase,
  onConfirm,
}: {
  phrase: string
  onConfirm: () => void
}) {
  const [confirmed, setConfirmed] = useState(false)
  return (
    <div>
      <h2 className="mb-2 text-lg font-semibold">
        Spara din återställningsfras
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Detta är enda sättet att återställa åtkomst om du glömmer lösenordet.
        Skriv ner de 24 orden och spara dem säkert — de visas inte igen.
      </p>
      <pre
        data-testid="lockscreen-recovery-key"
        className="mb-4 overflow-auto rounded-md border bg-muted p-3 text-sm font-mono"
      >
        {phrase}
      </pre>
      <label className="mb-4 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          data-testid="lockscreen-recovery-confirmed"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Jag har sparat återställningsfrasen på ett säkert ställe och förstår
          att den inte kan visas igen.
        </span>
      </label>
      <button
        type="button"
        onClick={onConfirm}
        disabled={!confirmed}
        data-testid="lockscreen-recovery-continue"
        className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        Fortsätt
      </button>
    </div>
  )
}
