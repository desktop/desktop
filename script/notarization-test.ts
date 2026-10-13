import assert from 'node:assert'
import { describe, it } from 'node:test'
import { getNotarizationOptions } from './notarization'

const apiCredentials = {
  APPLE_API_KEY_PATH: '/tmp/AuthKey_example.p8',
  APPLE_API_KEY_ID: 'example-key-id',
  APPLE_API_ISSUER: 'example-issuer',
}
const legacyCredentials = {
  APPLE_ID: 'example@example.com',
  APPLE_ID_PASSWORD: 'example-app-specific-password',
  APPLE_TEAM_ID: 'example-team',
}

describe('getNotarizationOptions', () => {
  it('uses the Electron API-key credential options', () => {
    assert.deepStrictEqual(getNotarizationOptions(apiCredentials), {
      appleApiKey: apiCredentials.APPLE_API_KEY_PATH,
      appleApiKeyId: apiCredentials.APPLE_API_KEY_ID,
      appleApiIssuer: apiCredentials.APPLE_API_ISSUER,
    })
  })

  it('ignores legacy credentials when API-key credentials are configured', () => {
    assert.deepStrictEqual(
      getNotarizationOptions({ ...legacyCredentials, ...apiCredentials }),
      getNotarizationOptions(apiCredentials)
    )
  })

  it('rejects legacy credentials without API-key credentials', () => {
    assert.throws(
      () => getNotarizationOptions(legacyCredentials),
      /Missing or incomplete notarization API-key configuration/
    )
  })

  it('rejects empty API credentials even with legacy credentials', () => {
    assert.throws(
      () =>
        getNotarizationOptions({
          ...legacyCredentials,
          APPLE_API_KEY_PATH: '',
          APPLE_API_KEY_ID: '',
          APPLE_API_ISSUER: '',
        }),
      /Missing or incomplete notarization API-key configuration/
    )
  })

  it('rejects absent credentials', () => {
    assert.throws(
      () => getNotarizationOptions({}),
      /Missing or incomplete notarization API-key configuration/
    )
  })

  const keys = Object.keys(apiCredentials)
  for (let mask = 1; mask < 7; mask++) {
    const partial = Object.fromEntries(
      keys.map((key, index) => [
        key,
        mask & (1 << index) ? 'example-value' : '',
      ])
    )
    it(`rejects partial API-key configuration ${mask}, even with legacy credentials`, () => {
      for (const env of [partial, { ...legacyCredentials, ...partial }]) {
        assert.throws(
          () => getNotarizationOptions(env),
          /Missing or incomplete notarization API-key configuration/
        )
      }
    })
  }
})
