import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Account } from '../../src/models/account'
import { AccountsStore } from '../../src/lib/stores/accounts-store'
import { createCredentialHelperTrampolineHandler } from '../../src/lib/trampoline/trampoline-credential-helper'
import { TrampolineCommandIdentifier } from '../../src/lib/trampoline/trampoline-command'
import { getHasRejectedCredentialsForEndpoint } from '../../src/lib/trampoline/trampoline-environment'
import { trampolineUIHelper } from '../../src/lib/trampoline/trampoline-ui-helper'
import { parseCredential } from '../../src/lib/git/credential'
import {
  IOAuthToken,
  OAuthRefreshRejectedError,
} from '../../src/lib/oauth-token'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'

const account = new Account(
  'octocat',
  'https://api.github.com',
  'old-access',
  [],
  '',
  1,
  'Octocat'
)

const renewed = (): IOAuthToken => ({
  accessToken: 'new-access',
  refreshToken: 'new-refresh',
  expiresAt: Date.now() + 8 * 60 * 60 * 1000,
})

async function setup(
  credential: IOAuthToken = {
    accessToken: account.token,
    refreshToken: 'old-refresh',
    expiresAt: Date.now(),
  },
  renew: () => Promise<IOAuthToken> = async () => renewed()
) {
  let renewals = 0
  const store = new AccountsStore(
    new InMemoryStore(),
    new AsyncInMemoryStore(),
    async () => {
      renewals++
      return renew()
    }
  )
  await store.addAccount(account, credential)
  return { store, renewals: () => renewals }
}

function getCredential(store: AccountsStore, trampolineToken = 'test') {
  const handler = createCredentialHelperTrampolineHandler(store)
  return handler({
    identifier: TrampolineCommandIdentifier.CredentialHelper,
    trampolineToken,
    parameters: ['get'],
    environmentVariables: new Map(),
    stdin: 'protocol=https\nhost=github.com\n\n',
  })
}

describe('Refreshing Git credentials', () => {
  it('refreshes before returning credentials', async () => {
    const { store, renewals } = await setup()
    const result = await getCredential(store)
    assert.ok(result)
    assert.equal(renewals(), 1)
    const credential = parseCredential(result)
    assert.equal(credential.get('username'), 'octocat')
    assert.equal(credential.get('password'), 'new-access')
    assert.ok(!result.includes('old-access') && !result.includes('refresh'))
  })

  it('returns plain tokens as they are', async () => {
    const { store, renewals } = await setup({ accessToken: account.token })
    const result = await getCredential(store)
    assert.ok(result)
    assert.equal(parseCredential(result).get('password'), 'old-access')
    assert.equal(renewals(), 0)
  })

  it('returns refreshable tokens that are still valid without renewing', async () => {
    const { store, renewals } = await setup({
      accessToken: account.token,
      refreshToken: 'old-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
    })
    const result = await getCredential(store)
    assert.ok(result)
    assert.equal(parseCredential(result).get('password'), 'old-access')
    assert.equal(renewals(), 0)
  })

  it('returns the current token while it is valid if renewal fails transiently', async () => {
    const { store, renewals } = await setup(
      {
        accessToken: account.token,
        refreshToken: 'old-refresh',
        expiresAt: Date.now() + 5 * 60 * 1000,
      },
      async () => {
        throw new Error('offline')
      }
    )
    const result = await getCredential(store)
    assert.ok(result)
    assert.equal(parseCredential(result).get('password'), 'old-access')
    assert.equal(renewals(), 1)
    assert.deepEqual(await store.getAll(), [account])
  })

  it('asks the user to sign in again when renewal is rejected', async t => {
    const { store } = await setup(undefined, async () => {
      throw new OAuthRefreshRejectedError()
    })
    const prompt = t.mock.method(
      trampolineUIHelper,
      'promptForGitHubSignIn',
      async () => undefined
    )

    const token = 'rejected-renewal'
    assert.equal(await getCredential(store, token), undefined)
    assert.deepEqual(await store.getAll(), [])
    assert.equal(prompt.mock.callCount(), 1)
    assert.equal(prompt.mock.calls[0].arguments[0], 'https://github.com/')
    assert.ok(
      getHasRejectedCredentialsForEndpoint(token, 'https://github.com/')
    )
  })
})
