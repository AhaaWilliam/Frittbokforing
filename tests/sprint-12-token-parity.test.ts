/**
 * Sprint 12 / 13 — Token-paritetstest.
 *
 * Verifierar att TS-tokens (`src/renderer/styles/tokens.ts`) och CSS-tokens
 * (`src/renderer/index.css` `@theme`-block) håller samma värden.
 *
 * Drift mellan dessa två källor är en klassisk skuld-källa: en utvecklare
 * uppdaterar färgvärde i en av filerna utan att uppdatera den andra, och
 * komponenter som läser från olika lager renderar olika färg utan att
 * något test fångar det. Detta test är vakten.
 *
 * Strategi: läs index.css som text, extrahera `--token: value;` deklarationer
 * via regex, och assertera mot tokens.ts-objekt.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  colorBase,
  fontFamily,
  fontSize,
  radius,
} from '../src/renderer/styles/tokens'

const CSS_PATH = join(__dirname, '..', 'src', 'renderer', 'index.css')

const cssSource = readFileSync(CSS_PATH, 'utf8')

/**
 * Extrahera värde för en CSS custom property från `index.css`.
 * Hittar både `@theme { --x: y; }` och `:root { --x: y; }` deklarationer.
 * Returnerar trimmat värde utan trailing semicolon.
 */
function readCssVar(name: string): string {
  const re = new RegExp(`${name.replace(/-/g, '\\-')}\\s*:\\s*([^;]+);`)
  const m = cssSource.match(re)
  if (!m) {
    throw new Error(
      `CSS variable ${name} not found in index.css — paritetstest kan inte verifiera.`,
    )
  }
  return m[1].trim()
}

describe('Sprint 12 — token paritet (TS ↔ CSS)', () => {
  describe('Neutral palette', () => {
    it.each([
      ['--color-neutral-50', colorBase.neutral50],
      ['--color-neutral-100', colorBase.neutral100],
      ['--color-neutral-200', colorBase.neutral200],
      ['--color-neutral-300', colorBase.neutral300],
      ['--color-neutral-400', colorBase.neutral400],
      ['--color-neutral-500', colorBase.neutral500],
      ['--color-neutral-600', colorBase.neutral600],
      ['--color-neutral-700', colorBase.neutral700],
      ['--color-neutral-800', colorBase.neutral800],
      ['--color-neutral-900', colorBase.neutral900],
      ['--color-neutral-950', colorBase.neutral950],
    ])('%s = %s', (name, expected) => {
      expect(readCssVar(name)).toBe(expected)
    })
  })

  describe('Brand palette', () => {
    it.each([
      ['--color-brand-50', colorBase.brand50],
      ['--color-brand-100', colorBase.brand100],
      ['--color-brand-500', colorBase.brand500],
      ['--color-brand-600', colorBase.brand600],
      ['--color-brand-700', colorBase.brand700],
      ['--color-brand-900', colorBase.brand900],
    ])('%s = %s', (name, expected) => {
      expect(readCssVar(name)).toBe(expected)
    })
  })

  describe('Status palette', () => {
    it.each([
      ['--color-success-100', colorBase.success100],
      ['--color-success-500', colorBase.success500],
      ['--color-warning-100', colorBase.warning100],
      ['--color-warning-500', colorBase.warning500],
      ['--color-danger-100', colorBase.danger100],
      ['--color-danger-500', colorBase.danger500],
      ['--color-info-100', colorBase.info100],
      ['--color-info-500', colorBase.info500],
    ])('%s = %s', (name, expected) => {
      expect(readCssVar(name)).toBe(expected)
    })
  })

  describe('Typography', () => {
    // CSS-värdet kan ha extra whitespace/newline från multi-rad deklaration,
    // och quote-stil (' vs ") skiljer mellan CSS-konvention och TS-string-
    // literal. Normalisera båda för semantisk jämförelse.
    const normalizeFont = (s: string) =>
      s.replace(/\s+/g, ' ').replace(/'/g, '"').trim()

    it('--font-display matches fontFamily.display', () => {
      expect(normalizeFont(readCssVar('--font-display'))).toBe(
        normalizeFont(fontFamily.display),
      )
    })

    it('--font-sans matches fontFamily.sans', () => {
      expect(normalizeFont(readCssVar('--font-sans'))).toBe(
        normalizeFont(fontFamily.sans),
      )
    })

    it('--font-mono matches fontFamily.mono', () => {
      expect(normalizeFont(readCssVar('--font-mono'))).toBe(
        normalizeFont(fontFamily.mono),
      )
    })

    it.each([
      ['--text-xs', fontSize.xs],
      ['--text-sm', fontSize.sm],
      ['--text-base', fontSize.base],
      ['--text-lg', fontSize.lg],
      ['--text-xl', fontSize.xl],
      ['--text-2xl', fontSize['2xl']],
      ['--text-3xl', fontSize['3xl']],
      ['--text-4xl', fontSize['4xl']],
      ['--text-5xl', fontSize['5xl']],
    ])('%s = %s', (name, expected) => {
      expect(readCssVar(name)).toBe(expected)
    })
  })

  describe('Radius', () => {
    it.each([
      ['--radius-sm', radius.sm],
      ['--radius-md', radius.md],
      ['--radius-lg', radius.lg],
      ['--radius-xl', radius.xl],
      ['--radius-2xl', radius['2xl']],
      ['--radius-full', radius.full],
    ])('%s = %s', (name, expected) => {
      expect(readCssVar(name)).toBe(expected)
    })
  })

  describe('Mode-scopes finns reserverade', () => {
    it('reserverar [data-mode="vardag"] scope', () => {
      expect(cssSource).toMatch(/\[data-mode='vardag'\]\s*\{/)
    })

    it('reserverar [data-mode="bokforare"] scope', () => {
      expect(cssSource).toMatch(/\[data-mode='bokforare'\]\s*\{/)
    })
  })

  describe('Backwards-compat aliases bevaras', () => {
    // Dessa namn är spridda i kodbasen — om de tappas bryts existerande
    // komponenter. Sprint 13 migrerar dem successivt; tills dess måste
    // de finnas kvar i @theme.
    it.each([
      '--color-background',
      '--color-foreground',
      '--color-card',
      '--color-card-foreground',
      '--color-muted',
      '--color-muted-foreground',
      '--color-border',
      '--color-primary',
      '--color-primary-foreground',
      '--color-destructive',
      '--color-destructive-foreground',
      '--radius',
    ])('%s finns', (name) => {
      expect(() => readCssVar(name)).not.toThrow()
    })
  })
})
