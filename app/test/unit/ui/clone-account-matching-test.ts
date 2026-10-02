import assert from 'node:assert'
import { describe, it } from 'node:test'
import { Account } from '../../../src/models/account'
import { findCloneAccounts } from '../../../src/ui/clone-repository/clone-account-matching'

const dotCom = 'https://api.github.com'
const enterprise = 'https://git.example.com/api/v3'

const account = (login: string, endpoint: string, id: number) =>
  new Account(login, endpoint, 'token', [], '', id, login)

describe('clone URL account matching', () => {
  const accounts = [
    account('alice', dotCom, 1),
    account('bob', dotCom, 2),
    account('charlie', enterprise, 3),
  ]

  it('checks every signed-in account on the URL host', async () => {
    const checked: string[] = []
    const matches = await findCloneAccounts(
      'https://github.com/owner/private.git',
      accounts,
      async user => {
        checked.push(user.login)
        return user.login !== 'alice'
      }
    )
    assert.deepStrictEqual(checked, ['alice', 'bob'])
    assert.deepStrictEqual(matches, [accounts[1]])
  })

  it('retains multiple eligible accounts for an explicit choice', async () => {
    const matches = await findCloneAccounts(
      'git@github.com:owner/shared.git',
      accounts,
      async () => true
    )
    assert.deepStrictEqual(matches, accounts.slice(0, 2))
  })

  it('leaves an inaccessible SSH clone without an account', async () => {
    const matches = await findCloneAccounts(
      'git@git.example.com:owner/private.git',
      accounts,
      async () => false
    )
    assert.deepStrictEqual(matches, [])
  })

  it('rejects failed access checks instead of treating them as no access', async () => {
    await assert.rejects(
      findCloneAccounts(
        'https://github.com/owner/private.git',
        accounts,
        async () => {
          throw new Error('Network unavailable')
        }
      ),
      { message: 'Network unavailable' }
    )
  })
})
