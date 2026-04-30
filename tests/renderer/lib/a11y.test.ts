import { describe, it, expect } from 'vitest'
import { errorIdFor, descriptionIdFor } from '../../../src/renderer/lib/a11y'

describe('errorIdFor', () => {
  it('returnerar fieldId-error', () => {
    expect(errorIdFor('email')).toBe('email-error')
  })

  it('hanterar specialtecken', () => {
    expect(errorIdFor('foo-bar.baz')).toBe('foo-bar.baz-error')
  })

  it('kastar vid tom fieldId (förhindrar duplicate-id)', () => {
    expect(() => errorIdFor('')).toThrow(/fieldId required/)
  })
})

describe('descriptionIdFor', () => {
  it('returnerar fieldId-description', () => {
    expect(descriptionIdFor('phone')).toBe('phone-description')
  })

  it('kastar vid tom fieldId', () => {
    expect(() => descriptionIdFor('')).toThrow(/fieldId required/)
  })

  it('error- och description-id är distinkta', () => {
    const e = errorIdFor('field')
    const d = descriptionIdFor('field')
    expect(e).not.toBe(d)
  })
})
