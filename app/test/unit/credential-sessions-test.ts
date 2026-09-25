import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Account } from '../../src/models/account'
import {
  AccountRequiresSignInError,
  CredentialSessions,
} from '../../src/lib/credential-sessions'
import {
  IOAuthToken,
  OAuthRefreshRejectedError,
} from '../../src/lib/oauth-token'
import { deserializeAccountCredential } from '../../src/lib/account-credential'
import { getKeyForAccount } from '../../src/lib/auth'
import { AsyncInMemoryStore } from '../helpers/stores'

const now = 1_800_000_000_000
const account = new Account(
  'octocat',
  'https://api.github.com',
  'old-access',
  [],
  '',
  1,
  'Octocat'
)
const expiring: IOAuthToken = {
  accessToken: account.token,
  refreshToken: 'old-refresh',
  expiresAt: now + 1_000,
  refreshTokenExpiresAt: now + 100_000_000,
}
const renewed: IOAuthToken = {
  accessToken: 'new-access',
  refreshToken: 'new-refresh',
  expiresAt: now + 28_800_000,
  refreshTokenExpiresAt: now + 200_000_000,
}

function setup(
  renew: (endpoint: string, token: string) => Promise<IOAuthToken> = async () =>
    renewed
) {
  const secure = new AsyncInMemoryStore()
  const signedOut: Account[] = []
  const renewals: Array<[string, string]> = []
  const revoked: string[] = []
  const sessions: CredentialSessions = new CredentialSessions(
    secure,
    {
      requireSignIn: async a => {
        sessions.retire(a.endpoint)
        signedOut.push(a)
        return a
      },
      onTokenRenewed: (endpoint, token) => renewals.push([endpoint, token]),
    },
    renew,
    () => now,
    async a => {
      revoked.push(a.token)
      return true
    }
  )
  return { sessions, secure, signedOut, renewals, revoked }
}

describe('CredentialSessions', () => {
  it('renews once, saves, and resolves the stale token copy to the new one', async () => {
    let calls = 0
    const { sessions, secure, renewals } = setup(async () => {
      calls++
      return renewed
    })
    sessions.restore(account, expiring)

    const tokens = await Promise.all([
      sessions.resolveToken(account.endpoint, account.token),
      sessions.getFreshToken(account),
    ])

    assert.deepEqual(tokens, ['new-access', 'new-access'])
    assert.equal(calls, 1)
    assert.deepEqual(renewals, [[account.endpoint, 'new-access']])
    assert.deepEqual(
      deserializeAccountCredential(
        await secure.getItem(getKeyForAccount(account), account.login)
      ),
      renewed
    )
    assert.equal(
      await sessions.resolveToken(account.endpoint, account.token),
      'new-access'
    )
  })

  it('passes through tokens it did not issue', async () => {
    const { sessions } = setup()
    sessions.restore(account, expiring)
    assert.equal(
      await sessions.resolveToken(account.endpoint, 'foreign'),
      'foreign'
    )
  })

  it('asks the delegate to sign out when renewal is rejected', async () => {
    const { sessions, signedOut } = setup(async () => {
      throw new OAuthRefreshRejectedError()
    })
    sessions.restore(account, expiring)

    await assert.rejects(
      sessions.getFreshToken(account),
      OAuthRefreshRejectedError
    )
    assert.deepEqual(signedOut, [account])
    await assert.rejects(
      sessions.resolveToken(account.endpoint, account.token),
      AccountRequiresSignInError
    )
  })

  it('drops a sign-in superseded while storage was pending', async () => {
    const { sessions, secure } = setup()
    const first = sessions.add(account, expiring, () => true)
    const second = sessions.add(account.withToken('newer'), renewed, () => true)

    assert.equal(await first, null)
    assert.equal((await second)?.token, 'new-access')
    assert.deepEqual(
      deserializeAccountCredential(
        await secure.getItem(getKeyForAccount(account), account.login)
      ),
      renewed
    )
  })

  it('stops tracking a session once it is retired', () => {
    const { sessions } = setup()
    sessions.restore(account, expiring)
    const token = sessions.trackToken(account.endpoint)

    assert.equal(token(), account.token)
    sessions.retire(account.endpoint)
    sessions.restore(account.withToken('other'), { accessToken: 'other' })
    assert.equal(token(), null)
  })

  it('revokes and signs out when the current token is rejected', async () => {
    const { sessions, signedOut, revoked } = setup()
    sessions.restore(account, { accessToken: account.token })

    await sessions.invalidateToken(account.endpoint, 'obsolete')
    assert.deepEqual(signedOut, [])

    await sessions.invalidateToken(account.endpoint, account.token)
    assert.deepEqual(signedOut, [account])
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(revoked, [account.token])
  })
})
