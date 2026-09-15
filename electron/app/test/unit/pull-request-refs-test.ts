import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  extractPullRequestNumbersFromCommits,
  findPullRequestsByNumbers,
} from '../../src/lib/pull-request-refs'
import { Commit } from '../../src/models/commit'
import { CommitIdentity } from '../../src/models/commit-identity'
import { PullRequest, PullRequestRef } from '../../src/models/pull-request'
import { GitHubRepository } from '../../src/models/github-repository'
import { Owner } from '../../src/models/owner'

function makeCommit(summary: string, body: string = ''): Commit {
  const author = new CommitIdentity('A', 'a@example.com', new Date(0))
  return new Commit(
    summary.length.toString(16).padStart(40, '0'),
    summary.length.toString(16).padStart(7, '0'),
    summary,
    body,
    author,
    author,
    [],
    [],
    []
  )
}

function makePullRequest(
  num: number,
  title: string = `PR ${num}`
): PullRequest {
  const owner = new Owner('owner', 'https://example.com', 1)
  const repo = new GitHubRepository(
    'repo',
    owner,
    1,
    false,
    'https://example.com/owner/repo'
  )
  const ref = new PullRequestRef('feature', 'sha', repo)
  return new PullRequest(
    new Date(0),
    title,
    num,
    ref,
    ref,
    'someone',
    false,
    ''
  )
}

describe('extractPullRequestNumbersFromCommits', () => {
  it('returns empty for no commits', () => {
    assert.deepEqual(extractPullRequestNumbersFromCommits([]), [])
  })

  it('extracts and de-duplicates refs from summaries and bodies in first-seen order', () => {
    const commits = [
      makeCommit('Merge pull request #123 from a/b'),
      makeCommit('Fix the thing (#456)', 'Fixes #789 and addresses #456.'),
    ]
    assert.deepEqual(
      extractPullRequestNumbersFromCommits(commits),
      [123, 456, 789]
    )
  })

  it('extracts gh-prefixed refs', () => {
    const commits = [makeCommit('Closes gh-321')]
    assert.deepEqual(extractPullRequestNumbersFromCommits(commits), [321])
  })

  it('skips cross-repo owner/repo#NNN references', () => {
    const commits = [makeCommit('Mirror of desktop/desktop#777')]
    assert.deepEqual(extractPullRequestNumbersFromCommits(commits), [])
  })

  it('does not match # preceded by a word character', () => {
    const commits = [makeCommit('color = #ff00aa')]
    assert.deepEqual(extractPullRequestNumbersFromCommits(commits), [])
  })
})

describe('findPullRequestsByNumbers', () => {
  it('matches by number in input order and skips unmatched numbers', () => {
    const prs = [makePullRequest(2), makePullRequest(1), makePullRequest(3)]
    const matched = findPullRequestsByNumbers([3, 1, 99], prs)
    assert.deepEqual(
      matched.map(p => p.pullRequestNumber),
      [3, 1]
    )
  })
})
