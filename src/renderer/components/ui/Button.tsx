import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

/**
 * Sprint 90 — Button-primitive.
 *
 * Standardiserad knapp-komponent som ersätter inline-className-buttons.
 * Använder token-baserade variants (S82-S85 token-migration) — alla
 * varianters färger kommer från CSS-tokens, inga raw tailwind-färger.
 *
 * Variants:
 * - `primary` (default): bg-primary, mörk, för primär CTA
 * - `secondary`: vit/border, för sekundär action
 * - `destructive`: bg-danger-500, för "ta bort"/"inaktivera"
 * - `warning`: bg-warning-500, för "korrigera"/"ångra"
 * - `ghost`: transparent, för icon-knappar och text-only
 *
 * Sizes:
 * - `sm`: kompakt (text-xs, px-2 py-1)
 * - `md` (default): standard (text-sm, px-4 py-2)
 * - `lg`: prominent (text-base, px-6 py-3)
 *
 * `forwardRef` för Radix-integration (asChild-mönster). Disabled-state
 * standardiserad: opacity-50 + cursor-not-allowed.
 *
 * Tooltip via title-attribut (HTMLButtonElement-default).
 */

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'destructive'
  | 'destructive-outline'
  | 'warning'
  | 'ghost'

export type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Optional ikon till vänster om labeln. */
  leftIcon?: ReactNode
  /** Optional ikon till höger om labeln. */
  rightIcon?: ReactNode
  /** Loading-state — visar spinner istället för leftIcon, disabled-effekt. */
  isLoading?: boolean
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary',
  secondary:
    'border border-input bg-background text-foreground hover:bg-muted focus-visible:ring-primary',
  destructive:
    'bg-danger-500 text-white hover:bg-danger-600 focus-visible:ring-danger-500',
  'destructive-outline':
    'border border-danger-100 bg-transparent text-danger-500 hover:bg-danger-100/50 focus-visible:ring-danger-500',
  warning:
    'bg-warning-500 text-white hover:bg-warning-600 focus-visible:ring-warning-500',
  ghost:
    'text-foreground hover:bg-muted focus-visible:ring-primary',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'text-xs px-2 py-1 gap-1',
  md: 'text-sm px-4 py-2 gap-1.5',
  lg: 'text-base px-6 py-3 gap-2',
}

const BASE_CLASSES =
  'inline-flex items-center justify-center rounded-md font-medium ' +
  'transition-colors focus:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-offset-2 disabled:opacity-50 ' +
  'disabled:cursor-not-allowed disabled:pointer-events-none'

function Spinner({ size }: { size: ButtonSize }) {
  const dim = size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'
  return (
    <svg
      className={`${dim} animate-spin`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  )
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    leftIcon,
    rightIcon,
    isLoading = false,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const classes = [
    BASE_CLASSES,
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      className={classes}
      aria-busy={isLoading || undefined}
      {...rest}
    >
      {isLoading ? <Spinner size={size} /> : leftIcon}
      {children}
      {!isLoading && rightIcon}
    </button>
  )
})
