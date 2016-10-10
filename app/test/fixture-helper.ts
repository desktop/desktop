import * as path from 'path'

const fs = require('fs-extra')
const temp = require('temp').track()

import { Repository } from '../src/models/repository'
import { GitProcess } from 'git-kitchen-sink'

/**
 * Set up the named fixture repository to be used in a test.
 *
 * @returns The path to the set up fixture repository.
 */
export function setupFixtureRepository(repositoryName: string): string {
  const testRepoFixturePath = path.join(__dirname, 'fixtures', repositoryName)
  const testRepoPath = temp.mkdirSync('desktop-git-test-')
  fs.copySync(testRepoFixturePath, testRepoPath)

  fs.renameSync(path.join(testRepoPath, '_git'), path.join(testRepoPath, '.git'))

  return testRepoPath
}

/**
 * Initializes a new, empty, git repository at in a temporary location.
 */
export async function setupEmptyRepository(): Promise<Repository> {
  const repoPath = temp.mkdirSync('desktop-empty-repo-')
  await GitProcess.exec([ 'init' ], repoPath)

  return new Repository(repoPath, -1, null)
}
