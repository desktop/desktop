import { Account } from '../../src/models/account'
import { AccountsStore } from '../../src/lib/stores'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'

describe('AccountsStore', () => {
  let accountsStore: AccountsStore

  beforeEach(() => {
    accountsStore = new AccountsStore(
      new InMemoryStore(),
      new AsyncInMemoryStore()
    )
  })

  describe('adding a new user', () => {
    it('contains the added user', async () => {
      const newAccountLogin = 'joan'
<<<<<<< HEAD
<<<<<<< HEAD
      await accountsStore.addAccount(
        new Account(newAccountLogin, '', 'deadbeef', [], '', 1, '')
=======
      await accountsStore!.addAccount(
        new Account(newAccountLogin, '', 'deadbeef', [], '', 1, '', [])
>>>>>>> upstream/track-scopes-for-current-token
=======
      await accountsStore!.addAccount(
        new Account(newAccountLogin, '', 'deadbeef', [], '', 1, '', [])
>>>>>>> upstream/experimental-ssh-setup
      )

      const users = await accountsStore.getAll()
      expect(users[0].login).toBe(newAccountLogin)
    })
  })
})
