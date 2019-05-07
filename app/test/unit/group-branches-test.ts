import { groupBranches } from '../../src/ui/branches'
import { Branch, BranchType } from '../../src/models/branch'

describe('Branches grouping', () => {
  const sha = '300acefssgsgs'
  const shortSha = '300acefs'
  const lastCommitDate = new Date()

  const currentBranch = new Branch(
    'master',
    null,
    sha,
    shortSha,
    lastCommitDate,
    BranchType.Local
  )
  const defaultBranch = new Branch(
    'master',
    null,
    sha,
    shortSha,
    lastCommitDate,
    BranchType.Local
  )
  const recentBranches = [
    new Branch(
      'some-recent-branch',
      null,
      sha,
      shortSha,
      lastCommitDate,
      BranchType.Local
    ),
  ]
  const otherBranch = new Branch(
    'other-branch',
    null,
    sha,
    shortSha,
    lastCommitDate,
    BranchType.Local
  )

  const allBranches = [currentBranch, ...recentBranches, otherBranch]

  it('should group branches', () => {
    const groups = groupBranches(
      defaultBranch,
      currentBranch,
      allBranches,
      recentBranches
    )
    expect(groups).toHaveLength(3)

    expect(groups[0].identifier).toBe('default')
    let items = groups[0].items
    expect(items[0].branch).toBe(defaultBranch)

    expect(groups[1].identifier).toBe('recent')
    items = groups[1].items
    expect(items[0].branch).toBe(recentBranches[0])

    expect(groups[2].identifier).toBe('other')
    items = groups[2].items
    expect(items[0].branch).toBe(otherBranch)
  })
})
