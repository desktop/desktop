import { describe, it } from 'node:test'
import assert from 'node:assert'
import { uniqueTokensByOrigin } from '../../src/main-process/authenticated-image-filter'

describe('authenticated images with multiple accounts', () => {
  it('does not send either account token for an ambiguous host', () => {
    const tokens = uniqueTokensByOrigin([
      { endpoint: 'https://api.github.com', token: 'work-token' },
      { endpoint: 'https://api.github.com', token: 'personal-token' },
      {
        endpoint: 'https://enterprise.example.com/api/v3',
        token: 'enterprise-token',
      },
    ])
    assert.strictEqual(tokens.has('https://api.github.com'), false)
    assert.strictEqual(
      tokens.get('https://enterprise.example.com'),
      'enterprise-token'
    )
  })
})
