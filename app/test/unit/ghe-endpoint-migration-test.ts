import { describe, it } from 'node:test'
import assert from 'node:assert'
import { getAPIEndpoint, getEnterpriseAPIURL } from '../../src/lib/api'
import {
  getLegacyGHEEndpoints,
  getMigratedGHEEndpoint,
} from '../../src/lib/ghe-endpoint-migration'

describe('getEnterpriseAPIURL', () => {
  it('uses the api. subdomain without a trailing slash for ghe.com', () => {
    assert.equal(
      getEnterpriseAPIURL('https://whatever.ghe.com'),
      'https://api.whatever.ghe.com'
    )
    assert.equal(
      getEnterpriseAPIURL('https://whatever.ghe.com/'),
      'https://api.whatever.ghe.com'
    )
  })

  it('is idempotent for API endpoints', () => {
    assert.equal(
      getEnterpriseAPIURL('https://api.whatever.ghe.com'),
      'https://api.whatever.ghe.com'
    )
    assert.equal(
      getEnterpriseAPIURL('https://api.whatever.ghe.com/'),
      'https://api.whatever.ghe.com'
    )
    assert.equal(
      getEnterpriseAPIURL('https://ghes.example.com/api/v3'),
      'https://ghes.example.com/api/v3'
    )
  })

  it('uses the /api/v3 path for GHES', () => {
    assert.equal(
      getEnterpriseAPIURL('https://ghes.example.com/'),
      'https://ghes.example.com/api/v3'
    )
  })
})

describe('getAPIEndpoint', () => {
  it('maps repository hosts to API endpoints', () => {
    assert.equal(getAPIEndpoint('https://github.com'), 'https://api.github.com')
    assert.equal(
      getAPIEndpoint('https://whatever.ghe.com'),
      'https://api.whatever.ghe.com'
    )
    assert.equal(
      getAPIEndpoint('https://ghes.example.com'),
      'https://ghes.example.com/api/v3'
    )
  })
})

describe('getMigratedGHEEndpoint', () => {
  it('migrates legacy ghe.com endpoints', () => {
    const canonical = 'https://api.whatever.ghe.com'
    assert.equal(getMigratedGHEEndpoint(`${canonical}/`), canonical)
    assert.equal(
      getMigratedGHEEndpoint('https://whatever.ghe.com/api/v3'),
      canonical
    )
  })

  it('returns undefined for canonical ghe.com endpoints', () => {
    assert.equal(
      getMigratedGHEEndpoint('https://api.whatever.ghe.com'),
      undefined
    )
  })

  it('returns undefined for non ghe.com endpoints', () => {
    assert.equal(getMigratedGHEEndpoint('https://api.github.com'), undefined)
    assert.equal(
      getMigratedGHEEndpoint('https://ghes.example.com/api/v3'),
      undefined
    )
  })

  it('round-trips with getLegacyGHEEndpoints', () => {
    const canonical = getEnterpriseAPIURL('https://whatever.ghe.com')
    for (const legacy of getLegacyGHEEndpoints(canonical)) {
      assert.equal(getMigratedGHEEndpoint(legacy), canonical)
    }
  })
})

describe('getLegacyGHEEndpoints', () => {
  it('returns legacy formats for canonical ghe.com endpoints', () => {
    assert.deepStrictEqual(
      getLegacyGHEEndpoints('https://api.whatever.ghe.com'),
      ['https://api.whatever.ghe.com/', 'https://whatever.ghe.com/api/v3']
    )
  })

  it('preserves explicit ports', () => {
    const canonical = 'https://api.whatever.ghe.com:8443'
    const legacy = getLegacyGHEEndpoints(canonical)
    assert.deepStrictEqual(legacy, [
      'https://api.whatever.ghe.com:8443/',
      'https://whatever.ghe.com:8443/api/v3',
    ])
    for (const endpoint of legacy) {
      assert.equal(getMigratedGHEEndpoint(endpoint), canonical)
    }
  })

  it('returns nothing for non ghe.com endpoints', () => {
    assert.deepStrictEqual(getLegacyGHEEndpoints('https://api.github.com'), [])
    assert.deepStrictEqual(
      getLegacyGHEEndpoints('https://ghes.example.com/api/v3'),
      []
    )
  })
})
