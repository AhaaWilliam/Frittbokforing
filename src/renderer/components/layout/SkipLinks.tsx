import { useSkipLinks } from '../../contexts/SkipLinksContext'

const LINK_CLASS =
  'sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:border focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow'

function handleSkipTo(
  e: React.MouseEvent<HTMLAnchorElement>,
  targetId: string,
) {
  e.preventDefault()
  const target = document.getElementById(targetId)
  if (!target) return
  if (!target.hasAttribute('tabindex')) {
    target.setAttribute('tabindex', '-1')
  }
  target.focus()
}

export function SkipLinks() {
  const { bulkActionsActive } = useSkipLinks()

  return (
    <>
      <a
        href="#main-content"
        onClick={(e) => handleSkipTo(e, 'main-content')}
        className={LINK_CLASS}
        data-testid="skip-to-main"
      >
        Hoppa till huvudinnehåll
      </a>
      {bulkActionsActive && (
        <a
          href="#bulk-actions"
          onClick={(e) => handleSkipTo(e, 'bulk-actions')}
          className={LINK_CLASS}
          data-testid="skip-to-bulk"
        >
          Hoppa till massåtgärder
        </a>
      )}
      <a
        href="#primary-nav"
        onClick={(e) => handleSkipTo(e, 'primary-nav')}
        className={LINK_CLASS}
        data-testid="skip-to-nav"
      >
        Hoppa till navigering
      </a>
    </>
  )
}
