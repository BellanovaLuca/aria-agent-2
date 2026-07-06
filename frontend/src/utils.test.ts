import { describe, it, expect } from 'vitest'
import { toYMD, fmtTs } from './utils'

describe('toYMD', () => {
  it('formats an ISO datetime to YYYY-MM-DD', () => {
    expect(toYMD('2026-07-06T14:30:00Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  it('returns empty string on invalid input', () => {
    expect(toYMD('not-a-date')).toBe('')
  })
})

describe('fmtTs', () => {
  it('formats a valid ISO timestamp', () => {
    const out = fmtTs('2026-07-06T14:30:00Z')
    expect(out).toContain('2026')
    expect(out).not.toBe('2026-07-06T14:30:00Z')
  })
  it('returns the input unchanged when not a date', () => {
    expect(fmtTs('xyz')).toBe('xyz')
  })
  it('supports date-only formatting', () => {
    const out = fmtTs('2026-07-06T14:30:00Z', true)
    expect(out).toMatch(/06\/07\/2026/)
  })
})
