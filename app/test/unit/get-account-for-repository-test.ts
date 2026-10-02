import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Account } from '../../src/models/account'
import { Repository } from '../../src/models/repository'
import { GitHubRepository } from '../../src/models/github-repository'
import { Owner } from '../../src/models/owner'
import {
  getAccountForRepository,
  getAccountForGitHubRepository,
} from '../../src/lib/get-account-for-repository'

const endpoint = 'https://api.github.com'
const work = new Account('work', endpoint, 'work-token', [], '', 1, 'Work')
const personal = new Account(
  'personal',
  endpoint,
  'personal-token',
  [],
  '',
  2,
  'Personal'
)
const owner = new Owner('owner', endpoint, 1)
const github = new GitHubRepository(
  'repo',
  owner,
  1,
  false,
  'https://github.com/owner/repo',
  'https://github.com/owner/repo.git',
  true,
  false,
  null,
  null
)

const repository = (
  identity?: { readonly endpoint: string; readonly id: number } | null
) =>
  new Repository(
    '/path/to/repo',
    1,
    github,
    false,
    null,
    {},
    false,
    undefined,
    undefined,
    identity
  )

describe('getAccountForRepository', () => {
  it('uses the associated account even when another on the host comes first', () => {
    assert.strictEqual(
      getAccountForRepository([work, personal], repository(personal)),
      personal
    )
  })

  it('does not fall back when the associated account is signed out', () => {
    assert.strictEqual(
      getAccountForRepository([work], repository(personal)),
      null
    )
  })

  it('does not infer an account after the repository was left unassociated', () => {
    assert.strictEqual(getAccountForRepository([work], repository(null)), null)
  })

  it('uses the sole host account before legacy associations have migrated', () => {
    assert.strictEqual(getAccountForRepository([work], repository()), work)
    assert.strictEqual(
      getAccountForRepository([work, personal], repository()),
      null
    )
  })
})

describe('getAccountForGitHubRepository', () => {
  it('routes status requests to the associated account', () => {
    assert.strictEqual(
      getAccountForGitHubRepository(
        [work, personal],
        [repository(personal)],
        endpoint,
        'owner',
        'repo'
      ),
      personal
    )
  })

  it('does not fetch for unassociated or conflicting tracked copies', () => {
    assert.strictEqual(
      getAccountForGitHubRepository(
        [work, personal],
        [repository(null)],
        endpoint,
        'owner',
        'repo'
      ),
      null
    )
    assert.strictEqual(
      getAccountForGitHubRepository(
        [work, personal],
        [repository(work), repository(personal)],
        endpoint,
        'owner',
        'repo'
      ),
      null
    )
  })
})
