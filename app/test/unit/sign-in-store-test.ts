import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { SignInStore, SignInStep } from '../../src/lib/stores/sign-in-store'
import { AccountsStore } from '../../src/lib/stores/accounts-store'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'
import { Account } from '../../src/models/account'

describe('SignInStore', () => {
    let signInStore: SignInStore
    let accountsStore: AccountsStore

    beforeEach(async () => {
        accountsStore = new AccountsStore(new InMemoryStore(), new AsyncInMemoryStore())
        signInStore = new SignInStore(accountsStore)
        // Wait for accounts to load
        await accountsStore.getAll() 
    })

    describe('beginDotComSignIn', () => {
        it('starts authentication flow even if accounts exist (multi-account support)', async () => {
            // Setup: Add an existing .com account
            const existingAccount = new Account(
                'existing-user',
                'https://api.github.com',
                'token',
                [],
                '',
                1,
                '',
                'free'
            )
            await accountsStore.addAccount(existingAccount)

            const accounts = await accountsStore.getAll()
            assert.equal(accounts.length, 1)

            // Act: Begin sign in
            signInStore.beginDotComSignIn()

            // Assert: Should be in Authentication state, NOT ExistingAccountWarning
            const state = signInStore.getState()
            assert.ok(state, 'State should not be null')
            assert.equal(state.kind, SignInStep.Authentication)
            if (state.kind === SignInStep.Authentication) {
                assert.equal(state.endpoint, 'https://api.github.com')
            }
        })
    })
})
