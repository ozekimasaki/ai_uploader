import { describe, it, expect } from 'vitest'

describe('Basic Tests', () => {
  it('should work', () => {
    expect(1 + 1).toBe(2)
  })

  it('should handle environment variables', () => {
    // Test environment variable parsing
    expect(typeof process.env.NODE_ENV).toBe('string')
  })
})
