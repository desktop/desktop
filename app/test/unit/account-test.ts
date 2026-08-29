import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  Account,
  accountRepositoryContextEquals,
} from '../../src/models/account'

function createAccount(login = 'mona', plan = 'free') {
  return new Account(
    login,
    'https://api.github.com',
    'token',
    [],
    '',
    1,
    'Mona Lisa',
    plan
  )
}

describe('accountRepositoryContextEquals', () => {
  it('detects login and plan changes which affect repository rules', () => {
    const account = createAccount()

    assert.equal(
      accountRepositoryContextEquals(account, createAccount('renamed')),
      false
    )
    assert.equal(
      accountRepositoryContextEquals(account, createAccount('mona', 'pro')),
      false
    )
  })

  it('ignores profile fields which do not affect repository state', () => {
    const account = createAccount()
    const renamedProfile = new Account(
      account.login,
      account.endpoint,
      account.token,
      account.emails,
      'new-avatar',
      account.id,
      'New Name',
      account.plan
    )

    assert.equal(accountRepositoryContextEquals(account, renamedProfile), true)
  })
})
