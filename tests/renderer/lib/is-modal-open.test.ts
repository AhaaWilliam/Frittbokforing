// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { isAnyModalOpen } from '../../../src/renderer/lib/is-modal-open'

describe('isAnyModalOpen (VS-105)', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('returnerar false när ingen Radix-modal finns', () => {
    expect(isAnyModalOpen()).toBe(false)
  })

  it('returnerar true när Radix Dialog är öppen', () => {
    const el = document.createElement('div')
    el.setAttribute('role', 'dialog')
    el.setAttribute('data-state', 'open')
    document.body.appendChild(el)
    expect(isAnyModalOpen()).toBe(true)
  })

  it('returnerar true när AlertDialog är öppen', () => {
    const el = document.createElement('div')
    el.setAttribute('role', 'alertdialog')
    el.setAttribute('data-state', 'open')
    document.body.appendChild(el)
    expect(isAnyModalOpen()).toBe(true)
  })

  it('returnerar false när Dialog är closed', () => {
    const el = document.createElement('div')
    el.setAttribute('role', 'dialog')
    el.setAttribute('data-state', 'closed')
    document.body.appendChild(el)
    expect(isAnyModalOpen()).toBe(false)
  })

  it('returnerar false för element utan data-state', () => {
    const el = document.createElement('div')
    el.setAttribute('role', 'dialog')
    document.body.appendChild(el)
    expect(isAnyModalOpen()).toBe(false)
  })
})
