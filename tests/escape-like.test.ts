import { describe, it, expect } from 'vitest'
import { escapeLikePattern, LIKE_ESCAPE_CHAR } from '../src/shared/escape-like'

describe('escapeLikePattern', () => {
  it('empty string → empty string', () => {
    expect(escapeLikePattern('')).toBe('')
  })

  it('plain text → unchanged', () => {
    expect(escapeLikePattern('hello')).toBe('hello')
  })

  it('escapes % wildcard', () => {
    expect(escapeLikePattern('50%')).toBe('50!%')
  })

  it('escapes _ wildcard', () => {
    expect(escapeLikePattern('foo_bar')).toBe('foo!_bar')
  })

  it('escapes the escape char itself', () => {
    expect(escapeLikePattern('!')).toBe('!!')
  })

  it('escapes mixed wildcards', () => {
    expect(escapeLikePattern('50% rabatt_special!')).toBe('50!% rabatt!_special!!')
  })

  it('Swedish characters unchanged', () => {
    expect(escapeLikePattern('åäö')).toBe('åäö')
  })

  it('LIKE_ESCAPE_CHAR is !', () => {
    expect(LIKE_ESCAPE_CHAR).toBe('!')
  })
})
