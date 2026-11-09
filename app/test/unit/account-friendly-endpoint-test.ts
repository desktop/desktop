import assert from 'node:assert'
import { describe, it } from 'node:test'
import { getDotComAPIEndpoint } from '../../src/lib/api'
import { Account, getFriendlyEndpoint } from '../../src/models/account'

describe('getFriendlyEndpoint', () => {
  it('names the GitHub.com API endpoint GitHub.com', () => {
    assert.strictEqual(
      getFriendlyEndpoint(getDotComAPIEndpoint()),
      'GitHub.com'
    )
  })

  it('returns the host of a GitHub Enterprise API endpoint', () => {
    assert.strictEqual(
      getFriendlyEndpoint('https://ghe.example.com/api/v3'),
      'ghe.example.com'
    )
  })

  it('matches Account.friendlyEndpoint', () => {
    const endpoint = 'https://ghe.example.com/api/v3'
    const account = new Account('login', endpoint, 'token', [], '', 1, '')
    assert.strictEqual(account.friendlyEndpoint, getFriendlyEndpoint(endpoint))
  })
})
