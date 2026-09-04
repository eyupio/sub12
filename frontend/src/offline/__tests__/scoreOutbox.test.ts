import { describe, it, expect } from 'vitest'

import { ApiError } from '../../api/client'
import { shouldDropOnFlushError } from '../scoreOutbox'

describe('shouldDropOnFlushError', () => {
  it('drops on a validation error (422)', () => {
    expect(shouldDropOnFlushError(new ApiError(422, 'score[0] lane must be 1..10'))).toBe(true)
  })

  it('drops on any 4xx, not just 422', () => {
    expect(shouldDropOnFlushError(new ApiError(400, 'invalid request body'))).toBe(true)
    expect(shouldDropOnFlushError(new ApiError(403, 'not authorised to score this event'))).toBe(true)
    expect(shouldDropOnFlushError(new ApiError(404, 'event not found'))).toBe(true)
    expect(shouldDropOnFlushError(new ApiError(409, 'event is closed'))).toBe(true)
  })

  it('retries on a 5xx server error', () => {
    expect(shouldDropOnFlushError(new ApiError(500, 'internal server error'))).toBe(false)
    expect(shouldDropOnFlushError(new ApiError(503, 'service unavailable'))).toBe(false)
  })

  it('retries on a plain network failure', () => {
    expect(shouldDropOnFlushError(new TypeError('Failed to fetch'))).toBe(false)
    expect(shouldDropOnFlushError(new Error('network error'))).toBe(false)
    expect(shouldDropOnFlushError('not an error at all')).toBe(false)
  })
})
