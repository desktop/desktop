import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Account } from '../../src/models/account'
import { findAccessibleRepositoryAccounts } from '../../src/lib/find-accessible-repository-accounts'

describe('finding accounts for an added repository', () => {
  const first = new Account(
    'joan',
    'https://api.github.com',
    'one',
    [],
    '',
    1,
    ''
  )
  const second = new Account(
    'alex',
    'https://api.github.com',
    'two',
    [],
    '',
    2,
    ''
  )
  const enterprise = new Account(
    'other',
    'https://enterprise.example.com/api/v3',
    'three',
    [],
    '',
    3,
    ''
  )
  const remote = 'git@github.com:team/repository.git'

  it('returns only the account on the primary host with access', async () => {
    const result = await findAccessibleRepositoryAccounts(
      [first, second, enterprise],
      remote,
      async (account, owner, name) => {
        assert.strictEqual(owner, 'team')
        assert.strictEqual(name, 'repository')
        return account.id === second.id
      }
    )

    assert.deepStrictEqual(result, [second])
  })

  it('returns all accessible accounts without arbitrarily choosing one', async () => {
    assert.deepStrictEqual(
      await findAccessibleRepositoryAccounts(
        [first, second],
        remote,
        async () => true
      ),
      [first, second]
    )
  })

  it('leaves the repository unassociated when no account has access', async () => {
    assert.deepStrictEqual(
      await findAccessibleRepositoryAccounts(
        [first, second],
        remote,
        async () => false
      ),
      []
    )
  })
})
