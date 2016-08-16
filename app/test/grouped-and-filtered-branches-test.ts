import * as chai from 'chai'
const expect = chai.expect

import { groupedAndFilteredBranches } from '../src/ui/branches/grouped-and-filtered-branches'
import { Branch } from '../src/lib/local-git-operations'

describe('Branches grouping', () => {
  const currentBranch = new Branch('master', null)
  const defaultBranch = new Branch('master', null)
  const recentBranches = [
    new Branch('some-recent-branch', null),
  ]
  const otherBranch = new Branch('other-branch', null)

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
