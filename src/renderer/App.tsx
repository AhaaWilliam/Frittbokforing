import { ErrorBoundary } from 'react-error-boundary'
import { Toaster } from 'sonner'
import { useCompanies } from './lib/hooks'
import { ActiveCompanyProvider } from './contexts/ActiveCompanyContext'
import { OnboardingWizard } from './pages/OnboardingWizard'
import { AppShell } from './pages/AppShell'
import { LockScreen } from './pages/LockScreen'
import { ErrorFallback } from './components/ui/ErrorFallback'
import { useAuth } from './lib/use-auth'

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
    return <OnboardingWizard />
  }

  return (
    <>
      <ErrorBoundary
        FallbackComponent={ErrorFallback}
        onReset={() => window.location.reload()}
      >
        <ActiveCompanyProvider>
          <AppShell />
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
