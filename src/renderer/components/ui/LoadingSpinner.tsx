export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div role="status" aria-live="polite" className={`flex items-center justify-center p-8 ${className ?? ''}`}>
      <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" aria-hidden="true" />
      <span className="sr-only">Laddar…</span>
    </div>
  )
}
