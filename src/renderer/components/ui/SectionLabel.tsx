import type { ReactNode } from 'react'

interface SectionLabelProps {
  children: ReactNode
  className?: string
  as?: 'span' | 'div' | 'h2' | 'h3'
}

/**
 * Section label — UPPERCASE, tracking-wide, faint, semibold, 10px.
 *
 * Använd för section-rubriker (t.ex. "PERIOD", "BOKFÖRING", "FÖRSÄLJNING")
 * som matchar H+G-prototypen. CSS-klass `.section-label` deklareras i
 * `src/renderer/index.css` (Sprint H+G-1).
 */
export function SectionLabel({
  children,
  className,
  as: Tag = 'div',
}: SectionLabelProps) {
  return (
    <Tag className={className ? `section-label ${className}` : 'section-label'}>
      {children}
    </Tag>
  )
}
