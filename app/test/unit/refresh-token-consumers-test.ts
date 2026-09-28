import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Account } from '../../src/models/account'
import { AccountsStore } from '../../src/lib/stores/accounts-store'
import { createCredentialHelperTrampolineHandler } from '../../src/lib/trampoline/trampoline-credential-helper'
import { TrampolineCommandIdentifier } from '../../src/lib/trampoline/trampoline-command'
import { parseCredential } from '../../src/lib/git/credential'
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

async function setup(expiresAt = Date.now()) {
  let renewals = 0
  const store = new AccountsStore(
    new InMemoryStore(),
    new AsyncInMemoryStore(),
    async () => {
      renewals++
      return {
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        expiresAt: Date.now() + 8 * 60 * 60 * 1000,
      }
    }
  )
  await store.addAccount(account, {
    accessToken: account.token,
    refreshToken: 'old-refresh',
    expiresAt,
  })
  return { store, renewals: () => renewals }
}

describe('Refreshing Git credentials', () => {
  for (const capabilities of ['', 'capability[]=authtype\n']) {
    it(`refreshes before returning credentials (${
      capabilities || 'Git LFS / legacy protocol'
    })`, async () => {
      const { store, renewals } = await setup()
      const handler = createCredentialHelperTrampolineHandler(store)
      const result = await handler({
        identifier: TrampolineCommandIdentifier.CredentialHelper,
        trampolineToken: 'test',
        parameters: ['get'],
        environmentVariables: new Map(),
        stdin: `protocol=https\nhost=github.com\n${capabilities}\n`,
      })
      assert.ok(result)
      assert.equal(renewals(), 1)
      assert.ok(!result.includes('old-access') && !result.includes('refresh'))
      const credential = parseCredential(result)
      if (capabilities) {
        assert.equal(credential.get('authtype'), 'Basic')
        assert.equal(credential.get('ephemeral'), '1')
        assert.equal(
          Buffer.from(credential.get('credential') ?? '', 'base64').toString(),
          'octocat:new-access'
        )
        assert.equal(credential.has('password'), false)
      } else {
        assert.equal(credential.get('username'), 'octocat')
        assert.equal(credential.get('password'), 'new-access')
      }
    })
  }
})
