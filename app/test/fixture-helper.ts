import * as path from 'path'

const fs = require('fs-extra')
const temp = require('temp').track()

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
