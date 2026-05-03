import { useEffect, useState } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { Toaster } from 'sonner'
import { useCompanies } from './lib/hooks'
import { ActiveCompanyProvider } from './contexts/ActiveCompanyContext'
import { OnboardingWizard } from './pages/OnboardingWizard'
import { FirstRunImport } from './pages/FirstRunImport'
import { AppShell } from './pages/AppShell'
import { LockScreen } from './pages/LockScreen'
import { ErrorFallback } from './components/ui/ErrorFallback'
import { useAuth } from './lib/use-auth'
import { useUiMode } from './lib/use-ui-mode'
import { VardagApp } from './modes/vardag/VardagApp'
import { HashRouter, useNavigate } from './lib/router'
import { routes } from './lib/routes'

export default function App() {
  const auth = useAuth()

  if (auth.state.kind === 'loading') {
    return (
      <div
        className="flex h-screen items-center justify-center"
        data-testid="app-loading"
        role="status"
        aria-live="polite"
      >
        <p className="text-muted-foreground">Laddar...</p>
      </div>
    )
  }

  if (auth.state.kind === 'error') {
    return (
      <div
        role="alert"
        className="flex h-screen items-center justify-center p-4 text-center text-danger-600"
      >
        <div>
          <p className="mb-2 font-semibold">Ett fel uppstod</p>
          <p className="text-sm">{auth.state.message}</p>
        </div>
      </div>
    )
  }

  if (auth.state.kind === 'locked') {
    return <LockScreen onUnlocked={auth.onUnlocked} />
  }

  // Unlocked — render the existing app stack.
  return <AuthenticatedApp />
}

function AuthenticatedApp() {
  const { data: companies = [], isLoading } = useCompanies()
  const [firstRunMode, setFirstRunMode] = useState<'wizard' | 'import'>(
    'wizard',
  )

  if (isLoading) {
    return (
      <div
        className="flex h-screen items-center justify-center"
        data-testid="app-loading"
        role="status"
        aria-live="polite"
      >
        <p className="text-muted-foreground">Laddar...</p>
      </div>
    )
  }

  if (companies.length === 0) {
    if (firstRunMode === 'import') {
      return <FirstRunImport onBack={() => setFirstRunMode('wizard')} />
    }
    return (
      <OnboardingWizard onImportInstead={() => setFirstRunMode('import')} />
    )
  }

  return (
    <>
      <ErrorBoundary
        FallbackComponent={ErrorFallback}
        onReset={() => window.location.reload()}
      >
        <ActiveCompanyProvider>
          {/* VS-140: HashRouter lyfts hit så useNavigate() fungerar i båda
              modes (Vardag-pillar/CloseMonthDialog/GlobalSearch behöver
              navigate). Tidigare bara monterad i AppShell — Vardag-mode
              kraschade med "useNavigate must be used within HashRouter". */}
          <HashRouter routes={routes} fallback="/overview">
            <ModeRouter />
          </HashRouter>
        </ActiveCompanyProvider>
      </ErrorBoundary>
      <Toaster
        richColors
        position="bottom-right"
        style={{ zIndex: 9999 }}
        data-testid="toast"
        toastOptions={{ className: 'e2e-toast' }}
      />
    </>
  )
}

// Sprint 17 — Mode-router (ADR 005). Splittar mellan Vardag- och
// Bokförar-skalen baserat på `useUiMode`. Mode persisteras i settings
// (key: `ui_mode`) — vid sessionsbyte återställs till samma läge.
function ModeRouter() {
  const { mode, setMode, loading } = useUiMode()
  const navigate = useNavigate()

  // VS-142: lyssna på notification:show från main-process. Skapa OS-
  // notifikation via Notification-API, och vid klick: byt till
  // bokförare-mode och navigera till /vat.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.api?.onNotification) return
    const unsub = window.api.onNotification((payload) => {
      try {
        if (typeof Notification === 'undefined') return
        const notif = new Notification(payload.title, { body: payload.body })
        notif.onclick = () => {
          if (payload.action === 'navigate-vat') {
            setMode('bokforare')
            // Defer navigate så ModeRouter hinner växla skal innan
            // useNavigate-routern tar över i den nya trädet.
            setTimeout(() => navigate('/vat'), 0)
          }
          try {
            window.focus()
          } catch {
            /* no-op */
          }
        }
      } catch {
        /* OS:t saknar Notification eller har nekat — tyst fallback */
      }
    })
    return unsub
  }, [setMode, navigate])

  if (loading) {
    return (
      <div
        className="flex h-screen items-center justify-center"
        data-testid="mode-loading"
        role="status"
        aria-live="polite"
      >
        <p className="text-muted-foreground">Laddar...</p>
      </div>
    )
  }

  return mode === 'vardag' ? <VardagApp /> : <AppShell />
}
