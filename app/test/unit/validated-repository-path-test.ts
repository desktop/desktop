/* tslint:disable:no-sync-functions */

import * as chai from 'chai'
const expect = chai.expect

import { setupFixtureRepository, openSync } from '../fixture-helper'
import { validatedRepositoryPath } from '../../src/lib/dispatcher/validated-repository-path'

describe('validatedRepositoryPath', () => {
  it('returns the path to the repository', async () => {
    const testRepoPath = setupFixtureRepository('test-repo')
    const result = await validatedRepositoryPath(testRepoPath)
    expect(result).to.equal(testRepoPath)
  })

  it('returns null if the path is not a repository', async () => {
    const testRepoPath = openSync('repo-test').path
    const result = await validatedRepositoryPath(testRepoPath)
    expect(result).to.equal(null)
  })
})
