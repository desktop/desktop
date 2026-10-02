import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Account } from '../../src/models/account'
import { GitHubRepository } from '../../src/models/github-repository'
import { Owner } from '../../src/models/owner'
import { Repository } from '../../src/models/repository'
import {
  getAccountForGitHubRepository,
  getAccountForRepository,
} from '../../src/lib/get-account-for-repository'

describe('getAccountForRepository', () => {
  const endpoint = 'https://api.github.com'
  const first = new Account('first', endpoint, 'first-token', [], '', 1, '')
  const second = new Account('second', endpoint, 'second-token', [], '', 2, '')
  const gitHubRepository = new GitHubRepository(
    'project',
    new Owner('owner', endpoint, 1),
    1
  )
  it('uses the explicitly associated account rather than another account on the host', () => {
    const associated = Object.assign(
      new Repository('/project', 1, gitHubRepository, false),
      { accountIdentity: { endpoint, id: second.id } }
    )

    assert.strictEqual(
      getAccountForRepository([first, second], associated),
      second
    )
  })

  it('does not fall back to another account when the associated account is signed out', () => {
    const associated = Object.assign(
      new Repository('/project', 1, gitHubRepository, false),
      { accountIdentity: { endpoint, id: second.id } }
    )

    assert.strictEqual(getAccountForRepository([first], associated), null)
  })

  it('does not infer an account for an explicitly unassociated repository', () => {
    const unassociated = Object.assign(
      new Repository('/project', 1, gitHubRepository, false),
      { accountIdentity: null }
    )

    assert.strictEqual(getAccountForRepository([first], unassociated), null)
  })

  it('resolves the associated account of a local-only repository', () => {
    const local = new Repository(
      '/local',
      2,
      null,
      false,
      null,
      {},
      false,
      undefined,
      undefined,
      { endpoint, id: second.id }
    )

    assert.strictEqual(getAccountForRepository([first, second], local), second)
  })

  it('routes GitHub feature requests by the local repository identity', () => {
    const associated = Object.assign(
      new Repository('/project', 1, gitHubRepository, false),
      { accountIdentity: { endpoint, id: second.id } }
    )
    assert.strictEqual(
      getAccountForGitHubRepository(
        [first, second],
        [associated],
        gitHubRepository
      ),
      second
    )
    assert.strictEqual(
      getAccountForGitHubRepository([first], [associated], gitHubRepository),
      null
    )
    assert.strictEqual(
      getAccountForGitHubRepository([first, second], [], gitHubRepository),
      null
    )
  })
})
