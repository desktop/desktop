import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { SignInStore, SignInStep } from '../../src/lib/stores/sign-in-store'
import { AccountsStore } from '../../src/lib/stores'
import { Account } from '../../src/models/account'
import { getDotComAPIEndpoint } from '../../src/lib/api'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'

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

    it('transitions to ExistingAccountWarning when a dotcom account exists', async () => {
      const existingAccount = createDotComAccount()
      accountsStore = createAccountsStore()
      signInStore = new SignInStore(accountsStore)

      await accountsStore.addAccount(existingAccount)

      signInStore.beginDotComSignIn()
      const state = signInStore.getState()
      assert.notEqual(state, null)
      assert.equal(state?.kind, SignInStep.ExistingAccountWarning)
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

    it('shows ExistingAccountWarning if enterprise account exists', async () => {
      const endpoint = 'https://github.example.com/api/v3'
      const existingAccount = createEnterpriseAccount('user', endpoint)
      accountsStore = createAccountsStore()
      signInStore = new SignInStore(accountsStore)

      await accountsStore.addAccount(existingAccount)

      signInStore.beginEnterpriseSignIn()
      await signInStore.setEndpoint('https://github.example.com')

      const state = signInStore.getState()
      assert.equal(state?.kind, SignInStep.ExistingAccountWarning)
    })
  })

  describe('reset', () => {
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
