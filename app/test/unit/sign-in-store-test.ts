import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import {
  SignInStore,
  SignInStep,
  SignInResult,
} from '../../src/lib/stores/sign-in-store'
import { AccountsStore } from '../../src/lib/stores'
import { Account } from '../../src/models/account'
import { getDotComAPIEndpoint } from '../../src/lib/api'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'
import { shell } from '../../src/lib/app-shell'

function createAccountsStore(
  accounts: ReadonlyArray<Account> = []
): AccountsStore {
  const dataStore = new InMemoryStore()
  if (accounts.length > 0) {
    const serialized = accounts.map(a => ({
      login: a.login,
      endpoint: a.endpoint,
      token: a.token,
      emails: a.emails,
      avatarURL: a.avatarURL,
      id: a.id,
      name: a.name,
      plan: a.plan,
    }))
    dataStore.setItem('users', JSON.stringify(serialized))
  }
  return new AccountsStore(dataStore, new AsyncInMemoryStore())
}

function createDotComAccount(login = 'octocat'): Account {
  return new Account(
    login,
    getDotComAPIEndpoint(),
    'test-token',
    [],
    'https://avatars.githubusercontent.com/u/1',
    1,
    login,
    'free'
  )
}

function createEnterpriseAccount(
  login = 'enterprise-user',
  endpoint = 'https://github.example.com/api/v3'
): Account {
  return new Account(login, endpoint, 'ent-token', [], '', 2, login, 'free')
}

describe('SignInStore', () => {
  let accountsStore: AccountsStore
  let signInStore: SignInStore

  beforeEach(() => {
    accountsStore = createAccountsStore()
    signInStore = new SignInStore(accountsStore)
  })

  describe('initial state', () => {
    it('starts with null state', () => {
      assert.equal(signInStore.getState(), null)
    })
  })

  describe('beginDotComSignIn', () => {
    it('retains a second login and refreshes a repeated login after authentication', async () => {
      const first = createDotComAccount()
      const second = createDotComAccount('second-user')
      const refreshed = first.withToken('refreshed-token')
      await accountsStore.addAccount(first)
      signInStore.onDidAuthenticate(account => {
        void accountsStore.addAccount(account)
      })

      for (const account of [second, refreshed]) {
        signInStore.beginDotComSignIn()
        await signInStore.authenticateWithBrowser()
        const state = signInStore.getState()
        assert.ok(state?.kind === SignInStep.Authentication)
        state.oauthState?.onAuthCompleted(account)
        await new Promise<void>(resolve => setImmediate(resolve))
        assert.strictEqual(signInStore.getState()?.kind, SignInStep.Success)
      }

      assert.deepStrictEqual(await accountsStore.getAll(), [refreshed, second])
    })

    it('transitions to Authentication step when no existing account', async () => {
      signInStore.beginDotComSignIn()
      const state = signInStore.getState()
      assert.notEqual(state, null)
      assert.equal(state?.kind, SignInStep.Authentication)
      if (state?.kind === SignInStep.Authentication) {
        assert.equal(state.endpoint, getDotComAPIEndpoint())
        assert.equal(state.error, null)
        assert.equal(state.loading, false)
      }
    })

    it('allows another sign-in when a dotcom account exists', async () => {
      const existingAccount = createDotComAccount()
      accountsStore = createAccountsStore()
      signInStore = new SignInStore(accountsStore)

      await accountsStore.addAccount(existingAccount)

      signInStore.beginDotComSignIn()
      const state = signInStore.getState()
      assert.notEqual(state, null)
      assert.equal(state?.kind, SignInStep.Authentication)
      await signInStore.authenticateWithBrowser()
      assert.deepStrictEqual(await accountsStore.getAll(), [existingAccount])
      signInStore.reset()
    })

    it('calls resultCallback when provided', async () => {
      let callbackCalled = false
      signInStore.beginDotComSignIn(() => {
        callbackCalled = true
      })

      // Reset triggers the callback with 'cancelled'
      signInStore.reset()
      assert.equal(callbackCalled, true)
    })
  })

  describe('beginEnterpriseSignIn', () => {
    it('transitions to EndpointEntry step', () => {
      signInStore.beginEnterpriseSignIn()
      const state = signInStore.getState()
      assert.notEqual(state, null)
      assert.equal(state?.kind, SignInStep.EndpointEntry)
    })

    it('sets initial state correctly', () => {
      signInStore.beginEnterpriseSignIn()
      const state = signInStore.getState()
      if (state?.kind === SignInStep.EndpointEntry) {
        assert.equal(state.error, null)
        assert.equal(state.loading, false)
      }
    })

    it('resets previous state before starting', () => {
      // Start a dotcom sign-in first
      signInStore.beginDotComSignIn()
      assert.equal(signInStore.getState()?.kind, SignInStep.Authentication)

      // Starting enterprise sign-in should replace that state
      signInStore.beginEnterpriseSignIn()
      assert.equal(signInStore.getState()?.kind, SignInStep.EndpointEntry)
    })
  })

  describe('setEndpoint', () => {
    it('marks a new Enterprise server requested by Git for confirmation', async () => {
      signInStore.beginEnterpriseSignIn()
      await signInStore.setEndpoint('https://github.example.com', true)

      const state = signInStore.getState()
      assert.ok(state?.kind === SignInStep.Authentication)
      assert.strictEqual(state.endpoint, 'https://github.example.com/api/v3')
      assert.strictEqual(state.isUnrecognizedEnterpriseServer, true)
    })

    it('retains server confirmation guidance while opening the browser', async () => {
      signInStore.beginEnterpriseSignIn()
      await signInStore.setEndpoint('https://github.example.com', true)

      await signInStore.authenticateWithBrowser()

      const state = signInStore.getState()
      assert.ok(state?.kind === SignInStep.Authentication)
      assert.strictEqual(state.isUnrecognizedEnterpriseServer, true)
      assert.notStrictEqual(state.oauthState, undefined)
      signInStore.reset()
    })

    it('does not resolve OAuth callbacks before browser authentication', async () => {
      signInStore.beginEnterpriseSignIn()
      await signInStore.setEndpoint('https://github.example.com', true)
      const state = signInStore.getState()

      await signInStore.resolveOAuthRequest({
        name: 'oauth',
        code: 'test-code',
        state: 'test-state',
      })

      assert.strictEqual(signInStore.getState(), state)
    })

    it('cancels a Git-requested sign-in before opening the browser', async () => {
      const results: string[] = []
      signInStore.beginEnterpriseSignIn(result => results.push(result.kind))
      await signInStore.setEndpoint('https://github.example.com', true)

      signInStore.reset()

      assert.strictEqual(signInStore.getState(), null)
      assert.deepStrictEqual(results, ['cancelled'])
    })

    it('shows guidance again after cancelling and starting a new sign-in', async () => {
      signInStore.beginEnterpriseSignIn()
      await signInStore.setEndpoint('https://github.example.com', true)
      signInStore.reset()

      signInStore.beginEnterpriseSignIn()
      await signInStore.setEndpoint('https://github.example.com', true)

      const state = signInStore.getState()
      assert.ok(state?.kind === SignInStep.Authentication)
      assert.strictEqual(state.isUnrecognizedEnterpriseServer, true)
    })

    it('validates Git-requested endpoints before showing confirmation guidance', async () => {
      signInStore.beginEnterpriseSignIn()
      await signInStore.setEndpoint('http://github.example.com', true)

      const state = signInStore.getState()
      assert.ok(state?.kind === SignInStep.EndpointEntry)
      assert.ok(state.error)
      assert.strictEqual(state.loading, false)
    })

    for (const url of [
      'https://github.com',
      'https://api.github.com',
      'https://example.ghe.com',
    ]) {
      it(`does not show server confirmation guidance for ${url}`, async () => {
        signInStore.beginEnterpriseSignIn()
        await signInStore.setEndpoint(url, true)

        const state = signInStore.getState()
        assert.ok(state?.kind === SignInStep.Authentication)
        assert.notStrictEqual(state.isUnrecognizedEnterpriseServer, true)
      })
    }

    it('allows another account without server guidance for a known Enterprise endpoint', async () => {
      await accountsStore.addAccount(createEnterpriseAccount())
      signInStore.beginEnterpriseSignIn()
      await signInStore.setEndpoint('https://github.example.com', true)

      const state = signInStore.getState()
      assert.ok(state?.kind === SignInStep.Authentication)
      assert.strictEqual(state.isUnrecognizedEnterpriseServer, false)
    })

    it('transitions to Authentication step for valid enterprise URL', async () => {
      signInStore.beginEnterpriseSignIn()
      await signInStore.setEndpoint('https://github.example.com')

      const state = signInStore.getState()
      assert.equal(state?.kind, SignInStep.Authentication)
    })

    it('redirects to dotcom flow for github.com URLs', async () => {
      signInStore.beginEnterpriseSignIn()
      await signInStore.setEndpoint('https://github.com')

      const state = signInStore.getState()
      // Should redirect to the Authentication step with the dotcom endpoint
      assert.equal(state?.kind, SignInStep.Authentication)
      if (state?.kind === SignInStep.Authentication) {
        assert.equal(state.endpoint, getDotComAPIEndpoint())
      }
    })

    it('redirects to dotcom flow for api.github.com URLs', async () => {
      signInStore.beginEnterpriseSignIn()
      await signInStore.setEndpoint('https://api.github.com')

      const state = signInStore.getState()
      assert.equal(state?.kind, SignInStep.Authentication)
      if (state?.kind === SignInStep.Authentication) {
        assert.equal(state.endpoint, getDotComAPIEndpoint())
      }
    })

    it('sets error for non-HTTPS URL', async () => {
      signInStore.beginEnterpriseSignIn()
      await signInStore.setEndpoint('http://github.example.com')

      const state = signInStore.getState()
      assert.equal(state?.kind, SignInStep.EndpointEntry)
      if (state?.kind === SignInStep.EndpointEntry) {
        assert.notEqual(state.error, null)
        assert.equal(state.loading, false)
      }
    })

    it('retains an existing enterprise account when starting another sign-in', async () => {
      const endpoint = 'https://github.example.com/api/v3'
      const existingAccount = createEnterpriseAccount('user', endpoint)
      accountsStore = createAccountsStore()
      signInStore = new SignInStore(accountsStore)

      await accountsStore.addAccount(existingAccount)

      signInStore.beginEnterpriseSignIn()
      await signInStore.setEndpoint('https://github.example.com')

      const state = signInStore.getState()
      assert.equal(state?.kind, SignInStep.Authentication)
      await signInStore.authenticateWithBrowser()
      assert.deepStrictEqual(await accountsStore.getAll(), [existingAccount])
      signInStore.reset()
    })
  })

  describe('beginSignInForAccount', () => {
    it('enters authentication at the supplied API endpoint with the expected login', () => {
      signInStore.beginSignInForAccount(
        'https://enterprise.example.com/api/v3',
        'mona'
      )
      const state = signInStore.getState()
      assert.ok(state?.kind === SignInStep.Authentication)
      assert.strictEqual(
        state.endpoint,
        'https://enterprise.example.com/api/v3'
      )
      assert.strictEqual(state.expectedLogin, 'mona')
      assert.strictEqual(state.error, null)
      assert.strictEqual(state.loading, false)
    })

    it('opens OAuth with the required login and signup disabled', async t => {
      const openedURLs: string[] = []
      t.mock.method(shell, 'openExternal', async (url: string) => {
        openedURLs.push(url)
      })
      signInStore.beginSignInForAccount(getDotComAPIEndpoint(), 'mona+work')
      await signInStore.authenticateWithBrowser()
      const state = signInStore.getState()
      assert.ok(state?.kind === SignInStep.Authentication)
      const url = new URL(openedURLs[0])
      assert.strictEqual(url.searchParams.get('login'), 'mona+work')
      assert.strictEqual(url.searchParams.get('allow_signup'), 'false')
      assert.strictEqual(url.searchParams.get('state'), state.oauthState?.state)
      signInStore.reset()
    })

    for (const account of [
      createDotComAccount('other-user'),
      createEnterpriseAccount('octocat'),
    ]) {
      it(`rejects a different identity (${account.login} at ${account.endpoint}) without account changes`, async () => {
        const original = createDotComAccount()
        await accountsStore.addAccount(original)
        const authenticated: Account[] = []
        const results: SignInResult[] = []
        signInStore.onDidAuthenticate(account => {
          authenticated.push(account)
          void accountsStore.addAccount(account)
        })
        signInStore.beginSignInForAccount(
          original.endpoint,
          original.login,
          result => results.push(result)
        )
        await signInStore.authenticateWithBrowser()
        const pendingState = signInStore.getState()
        assert.ok(pendingState?.kind === SignInStep.Authentication)
        pendingState.oauthState?.onAuthCompleted(account)
        await new Promise<void>(resolve => setImmediate(resolve))

        const state = signInStore.getState()
        assert.ok(state?.kind === SignInStep.Authentication)
        assert.match(state.error?.message ?? '', /Please sign in as octocat/)
        assert.strictEqual(state.loading, false)
        assert.strictEqual(state.expectedLogin, original.login)
        assert.deepStrictEqual(authenticated, [])
        assert.deepStrictEqual(results, [])
        assert.deepStrictEqual(await accountsStore.getAll(), [original])

        await signInStore.authenticateWithBrowser()
        const retryState = signInStore.getState()
        assert.ok(retryState?.kind === SignInStep.Authentication)
        assert.strictEqual(retryState.expectedLogin, original.login)
        retryState.oauthState?.onAuthCompleted(original)
        await new Promise<void>(resolve => setImmediate(resolve))
        assert.strictEqual(signInStore.getState()?.kind, SignInStep.Success)
        assert.deepStrictEqual(results, [
          { kind: 'success', account: original },
        ])
      })
    }

    it('accepts matching endpoint and login case-insensitively', async () => {
      const authenticated: Account[] = []
      const results: SignInResult[] = []
      const account = createDotComAccount()
      signInStore.onDidAuthenticate(account => authenticated.push(account))
      signInStore.beginSignInForAccount(
        account.endpoint.toUpperCase(),
        account.login.toUpperCase(),
        result => results.push(result)
      )
      await signInStore.authenticateWithBrowser()
      const state = signInStore.getState()
      assert.ok(state?.kind === SignInStep.Authentication)
      state.oauthState?.onAuthCompleted(account)
      await new Promise<void>(resolve => setImmediate(resolve))

      assert.strictEqual(signInStore.getState()?.kind, SignInStep.Success)
      assert.deepStrictEqual(authenticated, [account])
      assert.deepStrictEqual(results, [{ kind: 'success', account }])
    })

    it('ignores an OAuth callback with an invalid state', async () => {
      signInStore.beginSignInForAccount(getDotComAPIEndpoint(), 'octocat')
      await signInStore.authenticateWithBrowser()
      const state = signInStore.getState()
      await signInStore.resolveOAuthRequest({
        name: 'oauth',
        state: 'incorrect-state',
        code: 'unused-code',
      })
      assert.strictEqual(signInStore.getState(), state)
      signInStore.reset()
    })

    it('does not authenticate an account resolved after the session changes', async () => {
      const authenticated: Account[] = []
      signInStore.onDidAuthenticate(account => authenticated.push(account))
      signInStore.beginSignInForAccount(getDotComAPIEndpoint(), 'octocat')
      await signInStore.authenticateWithBrowser()
      const state = signInStore.getState()
      assert.ok(state?.kind === SignInStep.Authentication)
      state.oauthState?.onAuthCompleted(createDotComAccount())
      signInStore.beginSignInForAccount(getDotComAPIEndpoint(), 'other-user')
      await signInStore.authenticateWithBrowser()
      await new Promise<void>(resolve => setImmediate(resolve))

      assert.deepStrictEqual(authenticated, [])
      const currentState = signInStore.getState()
      assert.ok(currentState?.kind === SignInStep.Authentication)
      assert.strictEqual(currentState.expectedLogin, 'other-user')
      signInStore.reset()
    })
  })

  describe('reset', () => {
    it('reports cancellation once even when its callback resets again', () => {
      const results: SignInResult[] = []
      signInStore.beginDotComSignIn(result => {
        results.push(result)
        signInStore.reset()
      })
      signInStore.reset()
      signInStore.reset()
      assert.deepStrictEqual(results, [{ kind: 'cancelled' }])
      assert.strictEqual(signInStore.getState(), null)
    })

    it('delivers one success when completion is repeated and success observers reset', async () => {
      const results: SignInResult[] = []
      const authenticated: Account[] = []
      signInStore.onDidAuthenticate(account => authenticated.push(account))
      signInStore.onDidUpdate(state => {
        if (state?.kind === SignInStep.Success) {
          signInStore.reset()
        }
      })
      signInStore.beginDotComSignIn(result => results.push(result))
      await signInStore.authenticateWithBrowser()
      const state = signInStore.getState()
      assert.ok(state?.kind === SignInStep.Authentication)
      const account = createDotComAccount()
      state.oauthState?.onAuthCompleted(account)
      state.oauthState?.onAuthCompleted(account)
      await new Promise<void>(resolve => setImmediate(resolve))
      signInStore.reset()
      assert.deepStrictEqual(authenticated, [account])
      assert.deepStrictEqual(results, [{ kind: 'success', account }])
      assert.strictEqual(signInStore.getState(), null)
    })

    it('reports success exactly once when the result callback resets the store', async () => {
      const results: SignInResult[] = []
      signInStore.beginDotComSignIn(result => {
        results.push(result)
        if (result.kind === 'success') {
          signInStore.reset()
        }
      })
      await signInStore.authenticateWithBrowser()
      const state = signInStore.getState()
      assert.ok(state?.kind === SignInStep.Authentication)
      state.oauthState?.onAuthCompleted(createDotComAccount())
      await new Promise<void>(resolve => setImmediate(resolve))

      assert.strictEqual(signInStore.getState(), null)
      assert.deepStrictEqual(
        results.map(result => result.kind),
        ['success']
      )
    })

    it('does not overwrite a new sign-in started by a success callback', async () => {
      const results: SignInResult[] = []
      const nextResults: SignInResult[] = []
      signInStore.beginDotComSignIn(result => {
        results.push(result)
        if (result.kind === 'success') {
          signInStore.beginSignInForAccount(
            getDotComAPIEndpoint(),
            'next-account',
            next => nextResults.push(next)
          )
        }
      })
      await signInStore.authenticateWithBrowser()
      const state = signInStore.getState()
      assert.ok(state?.kind === SignInStep.Authentication)
      state.oauthState?.onAuthCompleted(createDotComAccount())
      await new Promise<void>(resolve => setImmediate(resolve))

      const next = signInStore.getState()
      assert.ok(next?.kind === SignInStep.Authentication)
      assert.strictEqual(next.expectedLogin, 'next-account')
      assert.deepStrictEqual(
        results.map(result => result.kind),
        ['success']
      )
      assert.deepStrictEqual(nextResults, [])
      signInStore.reset()
      assert.deepStrictEqual(nextResults, [{ kind: 'cancelled' }])
    })

    it('delivers success after the authentication subscriber resets the store', async () => {
      const events: string[] = []
      signInStore.onDidAuthenticate(() => {
        events.push('authenticated')
        signInStore.reset()
      })
      signInStore.beginDotComSignIn(result => events.push(result.kind))
      await signInStore.authenticateWithBrowser()
      const state = signInStore.getState()
      assert.ok(state?.kind === SignInStep.Authentication)
      state.oauthState?.onAuthCompleted(createDotComAccount())
      await new Promise<void>(resolve => setImmediate(resolve))

      assert.deepStrictEqual(events, ['authenticated', 'success'])
      assert.strictEqual(signInStore.getState(), null)
    })

    it('clears the state back to null', () => {
      signInStore.beginDotComSignIn()
      assert.notEqual(signInStore.getState(), null)

      signInStore.reset()
      assert.equal(signInStore.getState(), null)
    })

    it('calls resultCallback with cancelled', async () => {
      let result: any = null
      signInStore.beginDotComSignIn(r => {
        result = r
      })

      signInStore.reset()
      assert.notEqual(result, null)
      assert.equal(result.kind, 'cancelled')
    })
  })

  describe('onDidUpdate', () => {
    it('emits updates when state changes', async () => {
      const states: Array<any> = []
      signInStore.onDidUpdate(state => {
        states.push(state)
      })

      signInStore.beginDotComSignIn()
      assert.equal(states.length, 1)
      assert.equal(states[0]?.kind, SignInStep.Authentication)
    })

    it('emits null when reset', () => {
      const states: Array<any> = []
      signInStore.onDidUpdate(state => {
        states.push(state)
      })

      signInStore.beginDotComSignIn()
      signInStore.reset()

      // Should have: cancelled callback + null state + possibly more
      const lastState = states[states.length - 1]
      assert.equal(lastState, null)
    })
  })
})
