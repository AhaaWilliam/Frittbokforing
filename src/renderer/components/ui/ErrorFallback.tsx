import { FallbackProps } from 'react-error-boundary'

export function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const message =
    error instanceof Error ? error.message : 'Ett oväntat fel inträffade.'
  return (
    <div
      role="alert"
      aria-labelledby="error-fallback-title"
      className="flex flex-col items-center justify-center h-full gap-4 p-8"
    >
      <div className="text-destructive text-4xl" aria-hidden="true">
        ⚠️
      </div>
      <h2 id="error-fallback-title" className="text-lg font-semibold">
        Något gick fel
      </h2>
      <p className="text-sm text-muted-foreground max-w-md text-center">
        {message}
      </p>
      <button
        type="button"
        onClick={resetErrorBoundary}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
      >
        Försök igen
      </button>
    </div>
  )
}
