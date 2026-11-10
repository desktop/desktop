import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Account } from '../../src/models/account'
import { Repository } from '../../src/models/repository'
import { GitHubRepository } from '../../src/models/github-repository'
import { Owner } from '../../src/models/owner'
import {
  countAdditionalAccountSignIns,
  getAssignmentOutcome,
  getMultiAccountStats,
  isMultiAccountEndpoint,
} from '../../src/lib/stats/multi-account-stats'
import { getAccountForStatsAttribution } from '../../src/lib/get-account-for-repository'

const dotCom = 'https://api.github.com'
const ghes = 'https://ghes.example.com/api/v3'
const otherGhes = 'https://other.example.com/api/v3'

const account = (login: string, endpoint: string, id: number) =>
  new Account(login, endpoint, `${login}-token`, [], '', id, login)

const alice = account('alice', dotCom, 1)
const bob = account('bob', dotCom, 2)
const carol = account('carol', ghes, 3)
const dave = account('dave', ghes, 4)
const erin = account('erin', otherGhes, 5)

let nextId = 1
function repository(endpoint: string | null, login: string | null = null) {
  const id = nextId++
  return new Repository(
    `/repo-${id}`,
    id,
    endpoint === null
      ? null
      : new GitHubRepository('repo', new Owner('owner', endpoint, 1), id),
    false,
    null,
    {},
    false,
    undefined,
    undefined,
    login
  )
}

describe('multi-account stats', () => {
  describe('getMultiAccountStats', () => {
    it('reports zeros without accounts or repositories', () => {
      assert.deepEqual(getMultiAccountStats([], []), {
        dotComAccountCount: 0,
        enterpriseHostCount: 0,
        maxAccountsPerEndpoint: 0,
        hasMultipleAccountsPerEndpoint: false,
        multiAccountEndpointsInUseCount: 0,
        assignedRepositoryCount: 0,
        unassignedGitHubRepositoryCount: 0,
        signedOutAssignmentRepositoryCount: 0,
        repositoriesOnMultiAccountEndpointCount: 0,
      })
    })

    it('counts accounts per endpoint and enterprise hosts', () => {
      const stats = getMultiAccountStats([alice, bob, carol, dave, erin], [])
      assert.equal(stats.dotComAccountCount, 2)
      assert.equal(stats.enterpriseHostCount, 2)
      assert.equal(stats.maxAccountsPerEndpoint, 2)
      assert.equal(stats.hasMultipleAccountsPerEndpoint, true)
    })

    it('does not report multiple accounts with one account per endpoint', () => {
      const stats = getMultiAccountStats([alice, carol, erin], [])
      assert.equal(stats.maxAccountsPerEndpoint, 1)
      assert.equal(stats.hasMultipleAccountsPerEndpoint, false)
    })

    it('classifies repository assignments', () => {
      const stats = getMultiAccountStats(
        [alice, bob, carol],
        [
          repository(dotCom, 'alice'),
          repository(dotCom, 'bob'),
          repository(dotCom, null),
          repository(dotCom, 'mallory'),
          repository(ghes, 'carol'),
          repository(null),
        ]
      )
      assert.equal(stats.assignedRepositoryCount, 3)
      assert.equal(stats.unassignedGitHubRepositoryCount, 1)
      assert.equal(stats.signedOutAssignmentRepositoryCount, 1)
      assert.equal(stats.repositoriesOnMultiAccountEndpointCount, 4)
      assert.equal(stats.multiAccountEndpointsInUseCount, 1)
    })

    it('needs two accounts in use on an endpoint to count it as in use', () => {
      const stats = getMultiAccountStats(
        [alice, bob],
        [repository(dotCom, 'alice'), repository(dotCom, 'alice')]
      )
      assert.equal(stats.multiAccountEndpointsInUseCount, 0)
    })
  })

  it('detects multi-account endpoints', () => {
    assert.equal(isMultiAccountEndpoint([alice, bob, carol], dotCom), true)
    assert.equal(isMultiAccountEndpoint([alice, bob, carol], ghes), false)
    assert.equal(isMultiAccountEndpoint([alice], otherGhes), false)
  })

  describe('countAdditionalAccountSignIns', () => {
    it('counts a new account on an endpoint that already had one', () => {
      assert.equal(countAdditionalAccountSignIns([alice], [alice, bob]), 1)
    })

    it('does not count the first account on an endpoint', () => {
      assert.equal(countAdditionalAccountSignIns([], [alice]), 0)
      assert.equal(countAdditionalAccountSignIns([alice], [alice, carol]), 0)
    })

    it('does not count refreshed credentials for the same identity', () => {
      const refreshed = new Account(
        'alice',
        dotCom,
        'new-token',
        [],
        '',
        1,
        'alice'
      )
      assert.equal(
        countAdditionalAccountSignIns([alice, bob], [refreshed, bob]),
        0
      )
    })
  })

  describe('getAssignmentOutcome', () => {
    const url = 'https://github.com/owner/repo.git'
    const assignment = { account: alice, owner: 'owner', name: 'repo' }

    it('ignores cancelled choices', () => {
      assert.equal(getAssignmentOutcome(undefined, true, [alice], url), null)
    })

    it('distinguishes automatic and chosen assignments', () => {
      assert.equal(
        getAssignmentOutcome(assignment, false, [alice], url),
        'auto'
      )
      assert.equal(
        getAssignmentOutcome(assignment, true, [alice, bob], url),
        'chosen'
      )
    })

    it('reports unassigned GitHub remotes on a signed-in endpoint', () => {
      assert.equal(
        getAssignmentOutcome(null, false, [alice], url),
        'unassigned'
      )
    })

    it('ignores remotes that are not on a signed-in GitHub endpoint', () => {
      assert.equal(
        getAssignmentOutcome(
          null,
          false,
          [alice],
          'https://gitlab.com/o/r.git'
        ),
        null
      )
      assert.equal(getAssignmentOutcome(null, false, [carol], url), null)
    })
  })

  describe('getAccountForStatsAttribution', () => {
    it('prefers the assigned account', () => {
      assert.equal(
        getAccountForStatsAttribution([alice, bob], repository(dotCom, 'bob')),
        bob
      )
    })

    it('falls back to an account on the same endpoint', () => {
      assert.equal(
        getAccountForStatsAttribution([carol, alice], repository(dotCom)),
        alice
      )
      assert.equal(
        getAccountForStatsAttribution(
          [carol, alice],
          repository(dotCom, 'mallory')
        ),
        alice
      )
    })

    it('returns null without an account on the endpoint', () => {
      assert.equal(
        getAccountForStatsAttribution([carol], repository(dotCom)),
        null
      )
      assert.equal(
        getAccountForStatsAttribution([alice], repository(null)),
        null
      )
    })
  })
})
