import * as chai from 'chai'
const expect = chai.expect

import { groupedAndFilteredBranches } from '../../src/ui/branches/grouped-and-filtered-branches'
import { Branch, BranchType } from '../../src/models/branch'
import { Commit } from '../../src/models/commit'

describe('Branches grouping', () => {

  const commit = new Commit('300acef', 'summary', 'body', 'Hubot', 'hubot@github.com', new Date(), [])

  const currentBranch = new Branch('master', null, commit, BranchType.Local)
  const defaultBranch = new Branch('master', null, commit, BranchType.Local)
  const recentBranches = [
    new Branch('some-recent-branch', null, commit, BranchType.Local),
  ]
  const otherBranch = new Branch('other-branch', null, commit, BranchType.Local)

  const allBranches = [
    currentBranch,
    ...recentBranches,
    otherBranch,
  ]

  it('should return all branches when the filter is empty', () => {
    const results = groupedAndFilteredBranches(defaultBranch, currentBranch, allBranches, recentBranches, '')
    expect(results.length).to.equal(6)

    let i = 0
    expect(results[i].kind).to.equal('label')
    i++

    expect(results[i].kind).to.equal('branch')
    expect((results[i] as any).branch).to.equal(defaultBranch)
    i++

    expect(results[i].kind).to.equal('label')
    i++

    expect(results[i].kind).to.equal('branch')
    expect((results[i] as any).branch).to.equal(recentBranches[0])
    i++

    expect(results[i].kind).to.equal('label')
    i++

    expect(results[i].kind).to.equal('branch')
    expect((results[i] as any).branch).to.equal(otherBranch)
  })

  it('should only return branches that include the filter text', () => {
    const results = groupedAndFilteredBranches(defaultBranch, currentBranch, allBranches, recentBranches, 'ot')
    expect(results.length).to.equal(2)

    let i = 0
    expect(results[i].kind).to.equal('label')
    i++

    expect(results[i].kind).to.equal('branch')
    expect((results[i] as any).branch).to.equal(otherBranch)
  })

  it('should be case-insensitive', () => {
    const results = groupedAndFilteredBranches(defaultBranch, currentBranch, allBranches, recentBranches, 'oT')
    expect(results.length).to.equal(2)

    let i = 0
    expect(results[i].kind).to.equal('label')
    i++

    expect(results[i].kind).to.equal('branch')
    expect((results[i] as any).branch).to.equal(otherBranch)
  })
})
