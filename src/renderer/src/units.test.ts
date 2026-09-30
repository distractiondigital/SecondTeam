import { describe, expect, it } from 'vitest'
import { formatLength, parseLength } from './units'

describe('units', () => {
  it('parses plain numbers in the current units', () => {
    expect(parseLength('2.5', 'm')).toBe(2.5)
    expect(parseLength('10', 'ft')).toBeCloseTo(3.048)
  })

  it('parses explicit units in either system', () => {
    expect(parseLength('150cm', 'ft')).toBeCloseTo(1.5)
    expect(parseLength(`6' 2"`, 'm')).toBeCloseTo(1.8796)
    expect(parseLength('6ft 2in', 'm')).toBeCloseTo(1.8796)
    expect(parseLength('74in', 'm')).toBeCloseTo(1.8796)
    expect(parseLength(`-3'`, 'm')).toBeCloseTo(-0.9144)
    expect(parseLength('abc', 'm')).toBeNull()
  })

  it('formats for display', () => {
    expect(formatLength(1.25, 'm')).toBe('1.25')
    expect(formatLength(1.8796, 'ft')).toBe(`6' 2"`)
    expect(formatLength(0, 'ft')).toBe(`0' 0"`)
  })
})
