import * as chai from 'chai'
const expect = chai.expect

import User from '../src/user'
import UsersStore from '../src/users-store'
import InMemoryStore from './in-memory-store'

describe('UsersStore', () => {
  let usersStore: UsersStore = null
  beforeEach(() => {
    const inMemoryStore = new InMemoryStore()
    usersStore = new UsersStore(inMemoryStore, inMemoryStore)
  })

  describe('adding a new user', () => {
    it('contains the added user', () => {
      const newUserLogin = 'tonald-drump'
      usersStore.addUser(new User(newUserLogin, '', ''))

      const users = usersStore.getUsers()
      expect(users[0].getLogin()).to.equal('newUserLogin')
    })

    it('notifies when a user is added', () => {
      let changed = false
      usersStore.onUsersChanged(() => {
        changed = true
      })
      usersStore.addUser(new User('', '', ''))
      expect(changed).to.equal(true)
    })
  })
})
