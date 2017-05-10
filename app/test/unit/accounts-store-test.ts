import * as chai from 'chai'
const expect = chai.expect

import { Account } from '../../src/models/account'
import { Email } from '../../src/models/email'
import { AccountsStore } from '../../src/shared-process/accounts-store'
import { InMemoryStore } from '../in-memory-store'
import { AsyncInMemoryStore } from '../async-in-memory-store'

describe('AccountsStore', () => {
  let accountsStore: AccountsStore | null = null
  beforeEach(() => {
    accountsStore = new AccountsStore(new InMemoryStore(), new AsyncInMemoryStore())
  })

  describe('adding a new user', () => {
    it('contains the added user', async () => {
      const newAccountLogin = 'tonald-drump'
      await accountsStore!.addAccount(new Account(newAccountLogin, '', '', new Array<Email>(), '', 1, ''))

      const users = await accountsStore!.getAll()
      expect(users[0].login).to.equal(newAccountLogin)
    })
  })
})
