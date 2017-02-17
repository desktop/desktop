import * as Path from 'path'
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
  const testRepoFixturePath = Path.join(__dirname, 'fixtures', repositoryName)
  const testRepoPath = temp.mkdirSync('desktop-git-test-')
  fs.copySync(testRepoFixturePath, testRepoPath)

  fs.renameSync(Path.join(testRepoPath, '_git'), Path.join(testRepoPath, '.git'))

  const ignoreHiddenFiles = function(item: string){
    const basename = Path.basename(item)
    return basename === '.' || basename[0] !== '.'
  }

  const paths: ReadonlyArray<string> = fs.walkSync(testRepoPath)
  const visiblePaths = paths.filter(ignoreHiddenFiles)
  const submodules = visiblePaths.filter(path => Path.basename(path) === '_git')

  submodules.forEach(submodule => {
    const directory = Path.dirname(submodule)
    const newPath = Path.join(directory, '.git')
    fs.renameSync(submodule, newPath)
  })

  return testRepoPath
}

/**
 * Initializes a new, empty, git repository at in a temporary location.
 */
export async function setupEmptyRepository(): Promise<Repository> {
  const repoPath = temp.mkdirSync('desktop-empty-repo-')
  await GitProcess.exec([ 'init' ], repoPath)

  return new Repository(repoPath, -1, null, false)
}
