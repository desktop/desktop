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
        sessions.retire(a)
        signedOut.push(a)
        return a
      },
      onTokenRenewed: (a, token) => renewals.push([a.login, token]),
      onSignedIn: () => {},
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
    assert.deepEqual(renewals, [[account.login, 'new-access']])
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

  it('installs overlapping sign-ins in the order they are saved', async () => {
    const { sessions, secure } = setup()
    const first = sessions.add(account, expiring)
    const second = sessions.add(account.withToken('newer'), renewed)

    assert.equal((await first).token, expiring.accessToken)
    assert.equal((await second).token, 'new-access')
    await assert.rejects(
      sessions.resolveToken(account.endpoint, expiring.accessToken),
      AccountRequiresSignInError
    )
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
    const token = sessions.trackToken(account)

    assert.equal(token(), account.token)
    sessions.retire(account)
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

  describe('with multiple accounts on one endpoint', () => {
    const other = new Account(
      'hubot',
      account.endpoint,
      'hubot-access',
      [],
      '',
      2,
      'Hubot'
    )

    it('keeps a session for each account', async () => {
      const { sessions, secure } = setup()
      await sessions.add(account, { accessToken: account.token })
      await sessions.add(other, { accessToken: other.token })

      assert.equal(await sessions.getFreshToken(account), account.token)
      assert.equal(await sessions.getFreshToken(other), other.token)
      assert.equal(
        await secure.getItem(getKeyForAccount(account), account.login),
        account.token
      )
      assert.equal(
        await secure.getItem(getKeyForAccount(other), other.login),
        other.token
      )
    })

    it('renews only the account whose token expires', async () => {
      const { sessions, renewals } = setup()
      sessions.restore(account, expiring)
      sessions.restore(other, { accessToken: other.token })

      assert.equal(await sessions.getFreshToken(account), renewed.accessToken)
      assert.equal(await sessions.getFreshToken(other), other.token)
      assert.deepEqual(renewals, [[account.login, renewed.accessToken]])
    })

    it('signs out only the account whose token is rejected', async () => {
      const { sessions, signedOut } = setup()
      sessions.restore(account, { accessToken: account.token })
      sessions.restore(other, { accessToken: other.token })

      await sessions.invalidateToken(other.endpoint, other.token)
      assert.deepEqual(signedOut, [other])
      assert.equal(await sessions.getFreshToken(account), account.token)
      await assert.rejects(
        sessions.getFreshToken(other),
        AccountRequiresSignInError
      )
    })

    it('retiring one account leaves the other usable', async () => {
      const { sessions } = setup()
      sessions.restore(account, { accessToken: account.token })
      sessions.restore(other, { accessToken: other.token })

      sessions.retire(account)
      await assert.rejects(
        sessions.getFreshToken(account),
        AccountRequiresSignInError
      )
      assert.equal(
        await sessions.resolveToken(other.endpoint, other.token),
        other.token
      )
    })

    it('does not delete the stored credential of a different account', async () => {
      const { sessions, secure } = setup()
      await sessions.add(account, { accessToken: account.token })
      await sessions.add(other, { accessToken: other.token })

      sessions.retire(account)
      await sessions.delete(account)
      await sessions.delete(other)

      assert.equal(
        await secure.getItem(getKeyForAccount(account), account.login),
        null
      )
      assert.equal(
        await secure.getItem(getKeyForAccount(other), other.login),
        other.token
      )
    })
  })
})
