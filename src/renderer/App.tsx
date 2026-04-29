import { useState } from 'react'
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

export default function App() {
  const auth = useAuth()

  if (auth.state.kind === 'loading') {
    return (
      <div
        className="flex h-screen items-center justify-center"
        data-testid="app-loading"
      >
        <p className="text-muted-foreground">Laddar...</p>
      </div>
    )
  }

  if (auth.state.kind === 'error') {
    return (
      <div
        role="alert"
        className="flex h-screen items-center justify-center p-4 text-center text-red-600"
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
          <ModeRouter />
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
  const { mode, loading } = useUiMode()

  if (loading) {
    return (
      <div
        className="flex h-screen items-center justify-center"
        data-testid="mode-loading"
      >
        <p className="text-muted-foreground">Laddar...</p>
      </div>
    )
  }

  return mode === 'vardag' ? <VardagApp /> : <AppShell />
}
