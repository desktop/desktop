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
    renewed,
  clock = () => now
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
      onSignedIn: () => {},
    },
    renew,
    clock,
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
    const token = sessions.trackToken(account.endpoint)

    assert.equal(token(), account.token)
    sessions.retire(account.endpoint)
    sessions.restore(account.withToken('other'), { accessToken: 'other' })
    assert.equal(token(), null)
  })

  it('gets a renewed access token and its expiry from the issuing session', async () => {
    const { sessions, renewals } = setup()
    sessions.restore(account, expiring)
    const getToken = sessions.createTokenGetter(account)
    const expected = {
      accessToken: renewed.accessToken,
      expiresAt: renewed.expiresAt,
    }

    assert.deepEqual(await getToken(), expected)
    assert.deepEqual(await getToken(), expected)
    assert.deepEqual(renewals, [[account.endpoint, renewed.accessToken]])
  })

  it('rejects a late getter from a stale account after sign-in reuses its token', async () => {
    const { sessions } = setup()
    const original = await sessions.add(account, {
      ...renewed,
      accessToken: account.token,
    })
    const replacement = await sessions.add(original, {
      ...renewed,
      accessToken: original.token,
      refreshToken: 'replacement-refresh',
    })
    assert.notStrictEqual(original, replacement)
    assert.equal(original.token, replacement.token)

    assert.throws(
      () => sessions.createTokenGetter(original),
      AccountRequiresSignInError
    )
    assert.deepEqual(await sessions.createTokenGetter(replacement)(), {
      accessToken: replacement.token,
      expiresAt: renewed.expiresAt,
    })
  })

  it('never returns a token whose renewal started while it was handed out', async () => {
    const { sessions } = setup()
    sessions.restore(account, expiring)
    const getToken = sessions.createTokenGetter(account, 0)

    const getting = getToken()
    const renewing = sessions.getFreshToken(account)

    assert.deepEqual(await getting, {
      accessToken: renewed.accessToken,
      expiresAt: renewed.expiresAt,
    })
    assert.equal(await renewing, renewed.accessToken)
  })

  it('rejects retirement while handing out a token even if sign-in reuses it', async () => {
    const { sessions } = setup()
    sessions.restore(account, expiring)
    const getToken = sessions.createTokenGetter(account, 0)

    const getting = getToken()
    sessions.retire(account.endpoint)
    const replacement = sessions.restore(account, {
      ...renewed,
      accessToken: account.token,
    })

    await assert.rejects(getting, AccountRequiresSignInError)
    await assert.rejects(getToken(), AccountRequiresSignInError)
    assert.equal(
      (await sessions.createTokenGetter(replacement)()).accessToken,
      account.token
    )
  })

  it('preserves a session through immutable account copies without relying on token text', async () => {
    const { sessions } = setup()
    sessions.restore(account, { ...renewed, accessToken: account.token })
    const copied = sessions.inheritSession(
      account,
      account.withToken('copied-token-snapshot')
    )

    assert.deepEqual(await sessions.createTokenGetter(copied)(), {
      accessToken: account.token,
      expiresAt: renewed.expiresAt,
    })
    assert.equal(sessions.isRefreshable(copied), true)
    sessions.retire(account.endpoint)
    assert.equal(sessions.isRefreshable(copied), false)
    assert.throws(
      () => sessions.createTokenGetter(copied),
      AccountRequiresSignInError
    )
  })

  it('never reassigns an existing snapshot to a later issuing session', async () => {
    const { sessions } = setup()
    const original = await sessions.add(account, expiring)
    const replacement = await sessions.add(original, renewed)

    assert.throws(
      () => sessions.inheritSession(replacement, original),
      AccountRequiresSignInError
    )
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

  describe('Leases', () => {
    const minutes = (n: number) => n * 60_000
    const validFor = (ms: number): IOAuthToken => ({
      ...expiring,
      expiresAt: now + ms,
    })
    const tick = () => new Promise(resolve => setImmediate(resolve))

    it('waits for every holder to release a token before renewing it', async () => {
      let renewals = 0
      const { sessions } = setup(async () => {
        renewals++
        return renewed
      })
      sessions.restore(account, validFor(minutes(11)))

      const first = await sessions.leaseToken(account, 'first')
      const second = await sessions.leaseToken(account, 'second')
      assert.equal(first.token, account.token)
      assert.equal(second.token, account.token)

      let token: string | undefined
      const waiting = sessions
        .getFreshToken(account, minutes(12))
        .then(t => (token = t))
      first.release()
      first.release()
      await tick()
      assert.equal(token, undefined)
      assert.equal(renewals, 0)

      second.release()
      await waiting
      assert.equal(token, renewed.accessToken)
      assert.equal(renewals, 1)
    })

    it('gives a holder the token it already holds instead of renewing it', async () => {
      let renewals = 0
      const { sessions } = setup(async () => {
        renewals++
        return renewed
      })
      sessions.restore(account, validFor(minutes(5)))
      await sessions.leaseToken(account, 'git', 0)

      const again = await sessions.leaseToken(account, 'git')
      assert.equal(again.token, account.token)
      assert.equal(renewals, 0)
    })

    it('renews a leased token that is about to expire anyway', async () => {
      const { sessions } = setup()
      sessions.restore(account, validFor(30_000))
      await sessions.leaseToken(account, 'git', 0)

      assert.equal(await sessions.getFreshToken(account), renewed.accessToken)
    })

    it('stops waiting once the leased token is about to expire', async () => {
      const { sessions } = setup(undefined, Date.now)
      sessions.restore(account, {
        ...expiring,
        expiresAt: Date.now() + minutes(1) + 20,
      })
      await sessions.leaseToken(account, 'git', 0)

      assert.equal(await sessions.getFreshToken(account), renewed.accessToken)
    })

    it('stops waiting when the account signs out', async () => {
      const { sessions } = setup()
      sessions.restore(account, validFor(minutes(5)))
      await sessions.leaseToken(account, 'git', 0)

      const waiting = sessions.getFreshToken(account)
      sessions.retire(account.endpoint)
      await assert.rejects(waiting, AccountRequiresSignInError)
    })

    it('never leases a token whose renewal started while it was handed out', async () => {
      const { sessions } = setup()
      sessions.restore(account, validFor(minutes(5)))

      const leasing = sessions.leaseToken(account, 'git', 0)
      const renewing = sessions.getFreshToken(account)

      assert.equal((await leasing).token, renewed.accessToken)
      assert.equal(await renewing, renewed.accessToken)
    })

    it('uses the current token when renewal fails transiently', async () => {
      const { sessions, signedOut } = setup(async () => {
        throw new Error('offline')
      })
      sessions.restore(account, validFor(minutes(5)))

      const lease = await sessions.leaseToken(account, 'git')
      assert.equal(lease.token, account.token)
      assert.deepEqual(signedOut, [])
    })

    it('does not use an expired token when renewal fails transiently', async () => {
      const { sessions, signedOut } = setup(async () => {
        throw new Error('offline')
      })
      sessions.restore(account, validFor(0))

      await assert.rejects(sessions.leaseToken(account, 'git'), {
        message:
          'Unable to renew your GitHub session. Check your connection and try again shortly.',
      })
      assert.deepEqual(signedOut, [])
    })

    it('requires sign-in when renewal is rejected', async () => {
      const { sessions, signedOut } = setup(async () => {
        throw new OAuthRefreshRejectedError()
      })
      sessions.restore(account, validFor(minutes(5)))

      await assert.rejects(
        sessions.leaseToken(account, 'git'),
        AccountRequiresSignInError
      )
      assert.deepEqual(signedOut, [account])
    })
  })
})
