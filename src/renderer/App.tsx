import { ErrorBoundary } from 'react-error-boundary'
import { Toaster } from 'sonner'
import { useCompany } from './lib/hooks'
import { OnboardingWizard } from './pages/OnboardingWizard'
import { AppShell } from './pages/AppShell'
import { ErrorFallback } from './components/ui/ErrorFallback'

export default function App() {
  const { data: company, isLoading } = useCompany()

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

  if (!company) {
    return <OnboardingWizard />
  }

  return (
    <>
      <ErrorBoundary
        FallbackComponent={ErrorFallback}
        onReset={() => window.location.reload()}
      >
        <AppShell company={company} />
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
