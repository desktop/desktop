import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Account } from '../../src/models/account'
import { AccountsStore } from '../../src/lib/stores/accounts-store'
import { AccountRequiresSignInError } from '../../src/lib/credential-sessions'
import { createCopilotTokenProvider } from '../../src/lib/stores/copilot-store'
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

describe('Refreshing Copilot session credentials', () => {
  const now = 1_800_000_000_000

  it('does not change the legacy SDK authentication mode', async () => {
    const store = new AccountsStore(
      new InMemoryStore(),
      new AsyncInMemoryStore()
    )
    await store.addAccount(account)
    assert.equal(createCopilotTokenProvider(store, account), undefined)
  })

  it('satisfies the SDK one-hour refresh margin without exporting refresh tokens', async () => {
    const { store, renewals } = await setup({
      accessToken: account.token,
      refreshToken: 'old-refresh',
      expiresAt: Date.now() + 45 * 60 * 1000,
    })
    const provider = createCopilotTokenProvider(store, account)
    assert.ok(provider)
    const result = await provider({ host: 'github.com', reason: 'initial' })
    assert.equal(result.kind, 'token')
    assert.ok(result.kind === 'token')
    assert.equal(result.accessToken, 'new-access')
    assert.ok(result.expiresIn > 3600)
    assert.equal('refreshToken' in result, false)
    assert.equal(renewals(), 1)
  })

  it('aligns staggered sessions with the SDK cached-token refresh deadline', async t => {
    let clock = now
    t.mock.method(Date, 'now', () => clock)
    const { store, renewals } = await setup({
      accessToken: account.token,
      refreshToken: 'old-refresh',
      expiresAt: now + 3661 * 1000,
    })
    const firstProvider = createCopilotTokenProvider(store, account)
    const secondProvider = createCopilotTokenProvider(store, account)
    assert.ok(firstProvider && secondProvider)

    const first = await firstProvider({
      host: 'github.com',
      reason: 'initial',
    })
    assert.ok(first.kind === 'token')
    assert.equal(first.accessToken, account.token)
    assert.equal(renewals(), 0)

    clock += 2000
    const second = secondProvider({
      host: 'github.com',
      reason: 'initial',
    })
    // Model the SDK's one-hour preflight for the first session's cached token.
    const nextFirst =
      first.expiresIn - 2 <= 3600
        ? firstProvider({ host: 'github.com', reason: 'refresh' })
        : first
    const [refreshedFirst, initialSecond] = await Promise.all([
      nextFirst,
      second,
    ])
    assert.ok(refreshedFirst.kind === 'token')
    assert.ok(initialSecond.kind === 'token')
    assert.equal(refreshedFirst.accessToken, 'new-access')
    assert.equal(initialSecond.accessToken, refreshedFirst.accessToken)
    assert.equal(first.expiresIn, 3601)
    assert.equal(renewals(), 1)
  })

  it('keeps fractional lifetimes above the SDK rejection boundary', async t => {
    t.mock.method(Date, 'now', () => now)
    const { store, renewals } = await setup({
      accessToken: account.token,
      refreshToken: 'old-refresh',
      expiresAt: now + 3_660_500,
    })
    const provider = createCopilotTokenProvider(store, account)
    assert.ok(provider)

    const result = await provider({ host: 'github.com', reason: 'initial' })
    assert.ok(result.kind === 'token')
    assert.equal(result.accessToken, account.token)
    assert.equal(result.expiresIn, 3600.5)
    assert.equal(renewals(), 0)
  })

  it('renews at the inclusive SDK margin plus safety buffer', async t => {
    t.mock.method(Date, 'now', () => now)
    const { store, renewals } = await setup({
      accessToken: account.token,
      refreshToken: 'old-refresh',
      expiresAt: now + 3660 * 1000,
    })
    const provider = createCopilotTokenProvider(store, account)
    assert.ok(provider)

    const result = await provider({ host: 'github.com', reason: 'initial' })
    assert.ok(result.kind === 'token')
    assert.equal(result.accessToken, 'new-access')
    assert.equal(result.expiresIn, 8 * 60 * 60 - 60)
    assert.equal(renewals(), 1)
  })

  it('rejects renewed credentials whose buffered lifetime is too short for the SDK', async t => {
    t.mock.method(Date, 'now', () => now)
    const { store, renewals } = await setup(undefined, async () => ({
      ...renewed(),
      expiresAt: now + 3660 * 1000,
    }))
    const provider = createCopilotTokenProvider(store, account)
    assert.ok(provider)

    await assert.rejects(
      async () => provider({ host: 'github.com', reason: 'initial' }),
      {
        message:
          'GitHub returned credentials without enough lifetime for a Copilot session.',
      }
    )
    assert.equal(renewals(), 1)
  })

  it('rejects renewed credentials without a known lifetime', async () => {
    const { store } = await setup(undefined, async () => ({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    }))
    const provider = createCopilotTokenProvider(store, account)
    assert.ok(provider)

    await assert.rejects(
      async () => provider({ host: 'github.com', reason: 'initial' }),
      /without enough lifetime/
    )
  })

  it('follows renewal within its originating credential session', async t => {
    let clock = now
    t.mock.method(Date, 'now', () => clock)
    const { store, renewals } = await setup({
      accessToken: account.token,
      refreshToken: 'old-refresh',
      expiresAt: now + 2 * 60 * 60 * 1000,
    })
    const provider = createCopilotTokenProvider(store, account)
    assert.ok(provider)

    const first = await provider({ host: 'github.com', reason: 'initial' })
    assert.ok(first.kind === 'token')
    assert.equal(first.accessToken, account.token)

    clock += 60 * 60 * 1000
    const refreshed = await provider({ host: 'github.com', reason: 'refresh' })
    assert.ok(refreshed.kind === 'token')
    assert.equal(refreshed.accessToken, 'new-access')
    assert.equal(renewals(), 1)
  })

  for (const reuseAccessToken of [false, true]) {
    it(`rejects the old provider after same-user sign-in ${
      reuseAccessToken ? 'reuses the access token' : 'replaces the access token'
    }`, async () => {
      const { store, renewals } = await setup({
        ...renewed(),
        accessToken: account.token,
      })
      const oldProvider = createCopilotTokenProvider(store, account)
      assert.ok(oldProvider)

      await store.removeAccount(account)
      const accessToken = reuseAccessToken ? account.token : 'signed-in-again'
      const signedIn = account.withToken(accessToken)
      await store.addAccount(signedIn, { ...renewed(), accessToken })

      await assert.rejects(
        async () => oldProvider({ host: 'github.com', reason: 'refresh' }),
        /sign in again/
      )
      const newProvider = createCopilotTokenProvider(store, signedIn)
      assert.ok(newProvider)
      const result = await newProvider({
        host: 'github.com',
        reason: 'initial',
      })
      assert.ok(result.kind === 'token')
      assert.equal(result.accessToken, accessToken)
      assert.equal(renewals(), 0)
    })
  }

  it('does not bind an obsolete account token to a later same-user sign-in', async () => {
    const { store } = await setup({ ...renewed(), accessToken: account.token })
    await store.removeAccount(account)
    const signedIn = account.withToken('signed-in-again')
    await store.addAccount(signedIn, {
      ...renewed(),
      accessToken: signedIn.token,
    })
    assert.throws(
      () => createCopilotTokenProvider(store, account),
      AccountRequiresSignInError
    )
  })

  it('rejects creating a provider from a stale account after same-token sign-in', async () => {
    const { store } = await setup({ ...renewed(), accessToken: account.token })
    const [original] = await store.getAll()
    assert.ok(original)
    await store.removeAccount(original)
    const replacement = await store.addAccount(original, {
      ...renewed(),
      accessToken: original.token,
      refreshToken: 'replacement-refresh',
    })
    assert.ok(replacement)
    assert.notStrictEqual(original, replacement)
    assert.equal(original.token, replacement.token)

    assert.throws(
      () => createCopilotTokenProvider(store, original),
      AccountRequiresSignInError
    )
    const provider = createCopilotTokenProvider(store, replacement)
    assert.ok(provider)
    const result = await provider({ host: 'github.com', reason: 'initial' })
    assert.ok(result.kind === 'token')
    assert.equal(result.accessToken, replacement.token)
  })

  it('rejects a provider waiting on a Git lease when its session retires', async t => {
    const { store, renewals } = await setup({
      accessToken: account.token,
      refreshToken: 'old-refresh',
      expiresAt: Date.now() + 45 * 60 * 1000,
    })
    const lease = await store.leaseAccountToken(account, 'git')
    t.after(lease.release)
    const provider = createCopilotTokenProvider(store, account)
    assert.ok(provider)

    const result = Promise.resolve(
      provider({ host: 'github.com', reason: 'initial' })
    )
    const rejected = assert.rejects(result, /sign in again/)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(renewals(), 0)

    await store.removeAccount(account)
    const signedIn = account.withToken('signed-in-again')
    await store.addAccount(signedIn, {
      ...renewed(),
      accessToken: signedIn.token,
    })
    lease.release()
    await rejected
    assert.equal(renewals(), 0)
  })

  it('waits for Git to release the token before renewing it', async () => {
    const { store, renewals } = await setup({
      accessToken: account.token,
      refreshToken: 'old-refresh',
      expiresAt: Date.now() + 45 * 60 * 1000,
    })
    const lease = await store.leaseAccountToken(account, 'git')
    const provider = createCopilotTokenProvider(store, account)
    assert.ok(provider)

    let settled = false
    const result = Promise.resolve(
      provider({ host: 'github.com', reason: 'initial' })
    ).finally(() => (settled = true))
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(settled, false)
    assert.equal(renewals(), 0)

    lease.release()
    const token = await result
    assert.ok(token.kind === 'token')
    assert.equal(token.accessToken, 'new-access')
    assert.equal(renewals(), 1)
  })

  it('refuses credentials for a different host and after sign-out', async () => {
    const { store, renewals } = await setup()
    const provider = createCopilotTokenProvider(store, account)
    assert.ok(provider)
    await assert.rejects(
      async () => provider({ host: 'attacker.example', reason: 'initial' }),
      /unexpected GitHub host/
    )
    assert.equal(renewals(), 0)
    await store.removeAccount(account)
    await assert.rejects(
      async () => provider({ host: 'github.com', reason: 'initial' }),
      /sign in again/
    )
  })
})
