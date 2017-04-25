/* tslint:disable:no-sync-functions */

import * as Path from 'path'
import * as FSE from 'fs-extra'

const klawSync = require('klaw-sync')

const temp = require('temp').track()

import { Repository } from '../src/models/repository'
import { GitProcess } from 'dugite'

type KlawEntry = {
  path: string
}

/**
 * Set up the named fixture repository to be used in a test.
 *
 * @returns The path to the set up fixture repository.
 */
export function setupFixtureRepository(repositoryName: string): string {
  const testRepoFixturePath = Path.join(__dirname, 'fixtures', repositoryName)
  const testRepoPath = temp.mkdirSync('desktop-git-test-')
  FSE.copySync(testRepoFixturePath, testRepoPath)

  FSE.renameSync(Path.join(testRepoPath, '_git'), Path.join(testRepoPath, '.git'))

  const ignoreHiddenFiles = function(item: KlawEntry){
    const basename = Path.basename(item.path)
    return basename === '.' || basename[0] !== '.'
  }

  const entries: ReadonlyArray<KlawEntry> = klawSync(testRepoPath)
  const visiblePaths = entries.filter(ignoreHiddenFiles)
  const submodules = visiblePaths.filter(entry => Path.basename(entry.path) === '_git')

  submodules.forEach(entry => {
    const directory = Path.dirname(entry.path)
    const newPath = Path.join(directory, '.git')
    FSE.renameSync(entry.path, newPath)
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
