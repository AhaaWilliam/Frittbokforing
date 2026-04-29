import { useEffect, useState } from 'react'

/**
 * Security / account settings — change password, rotate recovery key,
 * configure auto-lock timeout. Backend handlers exist in
 * `src/main/auth/auth-handlers.ts`; this component wires the UI.
 *
 * All operations require the user to be authenticated (which they are,
 * since this page is inside AuthenticatedApp).
 */
export function SecuritySection() {
  return (
    <div className="mb-8">
      <h2 className="mb-4 text-base font-medium">Säkerhet</h2>
      <ChangePasswordBlock />
      <RotateRecoveryBlock />
      <AutoLockBlock />
    </div>
  )
}

async function getUserId(): Promise<string | null> {
  const res = await window.auth.status()
  if (!res.success) return null
  return res.data.userId
}

function ChangePasswordBlock() {
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    if (newPassword !== confirm) {
      setError('De nya lösenorden matchar inte')
      return
    }
    const userId = await getUserId()
    if (!userId) {
      setError('Ingen aktiv användare')
      return
    }
    setBusy(true)
    const res = await window.auth.changePassword({
      userId,
      oldPassword,
      newPassword,
    })
    setBusy(false)
    if (res.success) {
      setSuccess(true)
      setOldPassword('')
      setNewPassword('')
      setConfirm('')
    } else {
      setError(res.error)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="settings-change-password"
      className="mb-6 rounded-md border bg-card p-4"
    >
      <h3 className="mb-3 text-sm font-semibold">Byt lösenord</h3>
      <div className="space-y-2">
        <PasswordField
          label="Nuvarande lösenord"
          value={oldPassword}
          onChange={setOldPassword}
          testId="settings-old-password"
          autoComplete="current-password"
        />
        <PasswordField
          label="Nytt lösenord (minst 12 tecken)"
          value={newPassword}
          onChange={setNewPassword}
          testId="settings-new-password"
          autoComplete="new-password"
        />
        <PasswordField
          label="Bekräfta nytt lösenord"
          value={confirm}
          onChange={setConfirm}
          testId="settings-confirm-password"
          autoComplete="new-password"
        />
      </div>
      {error && (
        <p role="alert" className="mt-3 text-xs text-red-600">
          {error}
        </p>
      )}
      {success && (
        <p
          role="status"
          className="mt-3 text-xs text-green-600"
          data-testid="settings-password-success"
        >
          Lösenordet ändrat.
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !oldPassword || !newPassword}
        data-testid="settings-change-password-submit"
        className="mt-3 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {busy ? 'Ändrar…' : 'Byt lösenord'}
      </button>
    </form>
  )
}

function RotateRecoveryBlock() {
  const [phrase, setPhrase] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  async function handleGenerate() {
    const userId = await getUserId()
    if (!userId) {
      setError('Ingen aktiv användare')
      return
    }
    setBusy(true)
    setError(null)
    const res = await window.auth.rotateRecoveryKey({ userId })
    setBusy(false)
    if (res.success) {
      setPhrase(res.data.recoveryKey)
      setConfirmed(false)
    } else {
      setError(res.error)
    }
  }

  return (
    <div
      data-testid="settings-rotate-recovery"
      className="mb-6 rounded-md border bg-card p-4"
    >
      <h3 className="mb-3 text-sm font-semibold">Ny återställningsfras</h3>
      <p className="mb-3 text-xs text-muted-foreground">
        Genererar en ny 24-ords-fras och ogiltigförklarar den gamla. Spara den
        nya frasen säkert — den visas bara en gång.
      </p>
      {!phrase && !confirmOpen && (
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          data-testid="settings-rotate-open"
          className="rounded-md border border-input px-3 py-2 text-sm"
        >
          Generera ny fras
        </button>
      )}
      {!phrase && confirmOpen && (
        <div>
          <p className="mb-2 text-xs text-amber-700">
            Är du säker? Den gamla frasen kan inte användas efter detta.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="flex-1 rounded-md border border-input px-3 py-2 text-sm"
            >
              Avbryt
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={busy}
              data-testid="settings-rotate-confirm"
              className="flex-1 rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? 'Genererar…' : 'Ja, generera'}
            </button>
          </div>
        </div>
      )}
      {phrase && (
        <div>
          <pre
            data-testid="settings-rotate-phrase"
            className="mb-3 overflow-auto rounded-md border bg-muted p-3 text-sm font-mono"
          >
            {phrase}
          </pre>
          <label className="mb-3 flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              data-testid="settings-rotate-confirmed"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Jag har sparat den nya återställningsfrasen och förstår att den
              inte visas igen.
            </span>
          </label>
          <button
            type="button"
            onClick={() => {
              setPhrase(null)
              setConfirmOpen(false)
            }}
            disabled={!confirmed}
            data-testid="settings-rotate-done"
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Klar
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}

function AutoLockBlock() {
  const [minutes, setMinutes] = useState<number | null>(null)
  const [savedMinutes, setSavedMinutes] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.auth.status().then((res) => {
      if (res.success) {
        const m = Math.round(res.data.timeoutMs / 60_000)
        setMinutes(m)
        setSavedMinutes(m)
      }
    })
  }, [])

  async function handleSave() {
    if (minutes == null || minutes < 1 || minutes > 1440) {
      setError('Värdet måste vara mellan 1 och 1440 minuter')
      return
    }
    setError(null)
    setSaved(false)
    setBusy(true)
    const res = await window.auth.setTimeout({ timeoutMs: minutes * 60_000 })
    setBusy(false)
    if (res.success) {
      setSavedMinutes(minutes)
      setSaved(true)
    } else {
      setError(res.error)
    }
  }

  if (minutes == null) return null
  const dirty = minutes !== savedMinutes

  return (
    <div
      data-testid="settings-auto-lock"
      className="rounded-md border bg-card p-4"
    >
      <h3 className="mb-3 text-sm font-semibold">Automatiskt lås</h3>
      <p className="mb-3 text-xs text-muted-foreground">
        Antal minuter av inaktivitet innan appen automatiskt låses.
      </p>
      <div className="flex items-end gap-2">
        <div>
          <label
            htmlFor="settings-auto-lock-minutes"
            className="mb-1 block text-xs font-medium"
          >
            Minuter
          </label>
          <input
            id="settings-auto-lock-minutes"
            data-testid="settings-auto-lock-minutes"
            type="number"
            min={1}
            max={1440}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="w-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={busy || !dirty}
          data-testid="settings-auto-lock-save"
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? 'Sparar…' : 'Spara'}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-xs text-red-600">
          {error}
        </p>
      )}
      {saved && (
        <p
          role="status"
          className="mt-3 text-xs text-green-600"
          data-testid="settings-auto-lock-saved"
        >
          Sparat.
        </p>
      )}
    </div>
  )
}

function PasswordField({
  label,
  value,
  onChange,
  testId,
  autoComplete,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  testId: string
  autoComplete: string
}) {
  return (
    <div>
      <label htmlFor={testId} className="mb-1 block text-xs font-medium">
        {label}
      </label>
      <input
        id={testId}
        data-testid={testId}
        type="password"
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    </div>
  )
}
