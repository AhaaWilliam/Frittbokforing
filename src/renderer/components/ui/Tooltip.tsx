import { memo, useState, useCallback, useId } from 'react'

interface TooltipProps {
  content: string
  children: React.ReactElement
}

/**
 * A11y-correct tooltip: visible on hover AND focus.
 * Uses aria-describedby (not title attribute).
 */
export const Tooltip = memo(function Tooltip({ content, children }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const tooltipId = useId()

  const show = useCallback(() => setVisible(true), [])
  const hide = useCallback(() => setVisible(false), [])

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <span
        tabIndex={0}
        aria-describedby={visible ? tooltipId : undefined}
        className="inline-flex"
      >
        {children}
      </span>
      {visible && (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-50 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-xs text-background shadow-md"
        >
          {content}
        </span>
      )}
    </span>
  )
})
