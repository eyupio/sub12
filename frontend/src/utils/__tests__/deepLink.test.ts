import { describe, expect, it } from 'vitest'
import { deepLinkToPath } from '../deepLink'

describe('deepLinkToPath', () => {
  it('extracts the path from a Universal/App Link', () => {
    expect(deepLinkToPath('https://sub12.io/share/leagues/abc')).toBe('/share/leagues/abc')
  })

  it('preserves query string and hash', () => {
    expect(deepLinkToPath('https://sub12.io/scores/123?x=1#g')).toBe('/scores/123?x=1#g')
  })

  it('returns null for a bare host', () => {
    expect(deepLinkToPath('https://sub12.io/')).toBeNull()
    expect(deepLinkToPath('https://sub12.io')).toBeNull()
  })

  it('returns null for an unparseable value', () => {
    expect(deepLinkToPath('not a url')).toBeNull()
    expect(deepLinkToPath('')).toBeNull()
  })
})
