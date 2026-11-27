import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  getAccountRepositoryChanges,
  getInitialAccountRepositorySelection,
  getRepositoriesForAccountHost,
  isPreviouslyUnknownAccount,
} from '../../src/lib/account-repositories'
import { Account } from '../../src/models/account'
import { GitHubRepository } from '../../src/models/github-repository'
import { Owner } from '../../src/models/owner'
import { Repository } from '../../src/models/repository'

const dotCom = 'https://api.github.com'
const enterprise = 'https://enterprise.example.com/api/v3'
const alice = new Account('alice', dotCom, 'token', [], '', 1, '')

function createRepository(
  id: number,
  name: string,
  login: string | null = null,
  endpoint: string | null = dotCom
) {
  return new Repository(
    `/repos/${name}`,
    id,
    endpoint === null
      ? null
      : new GitHubRepository(name, new Owner('owner', endpoint, 1), id),
    false,
    null,
    {},
    false,
    undefined,
    undefined,
    login
  )
}

const unassigned = createRepository(1, 'unassigned')
const assignedToAlice = createRepository(2, 'Alice-repo', 'ALICE')
const assignedToBob = createRepository(3, 'bob-repo', 'bob')
const onEnterprise = createRepository(4, 'enterprise', null, enterprise)
const local = createRepository(5, 'local', null, null)
const all = [unassigned, assignedToAlice, assignedToBob, onEnterprise, local]

describe('account repositories', () => {
  it('lists every GitHub repository on the account host, sorted by name', () => {
    assert.deepStrictEqual(
      getRepositoriesForAccountHost(all, alice).map(r => r.id),
      [2, 3, 1]
    )
  })

  it('selects unassigned repositories and those already assigned to the account', () => {
    assert.deepStrictEqual(
      [...getInitialAccountRepositorySelection(all, alice)].sort(),
      [1, 2, 4, 5]
    )
  })

  it('assigns selected repositories and keeps unselected assignments', () => {
    const changes = getAccountRepositoryChanges(all, alice, new Set([1, 3]))
    assert.deepStrictEqual(
      changes.map(c => [c.repository.id, c.login]),
      [
        [2, null],
        [3, 'alice'],
        [1, 'alice'],
      ]
    )
  })

  it('makes no changes for the initial selection of assigned repositories', () => {
    assert.deepStrictEqual(
      getAccountRepositoryChanges(all, alice, new Set([2])),
      []
    )
  })

  it('only treats accounts with a new identity as previously unknown', () => {
    const refreshed = new Account('Alice', dotCom, 'new-token', [], '', 1, '')
    assert.strictEqual(isPreviouslyUnknownAccount([alice], refreshed), false)
    const other = new Account('alice', enterprise, 'token', [], '', 1, '')
    assert.strictEqual(isPreviouslyUnknownAccount([alice], other), true)
  })
})
