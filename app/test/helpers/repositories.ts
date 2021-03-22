import * as Path from 'path'
import * as FSE from 'fs-extra'
import { mkdirSync } from './temp'
import klawSync, { Item } from 'klaw-sync'
import { Repository } from '../../src/models/repository'
import { GitProcess } from 'dugite'
import { makeCommit, switchTo } from './repository-scaffolding'
import { writeFile } from 'fs-extra'
import { git } from '../../src/lib/git'

/**
 * Set up the named fixture repository to be used in a test.
 *
 * @returns The path to the set up fixture repository.
 */
export async function setupFixtureRepository(
  repositoryName: string
): Promise<string> {
  const testRepoFixturePath = Path.join(
    __dirname,
    '..',
    'fixtures',
    repositoryName
  )
  const testRepoPath = mkdirSync('desktop-git-test-')
  await FSE.copy(testRepoFixturePath, testRepoPath)

  await FSE.rename(
    Path.join(testRepoPath, '_git'),
    Path.join(testRepoPath, '.git')
  )

  const ignoreHiddenFiles = function (item: Item) {
    const basename = Path.basename(item.path)
    return basename === '.' || basename[0] !== '.'
  }

  const entries = klawSync(testRepoPath)
  const visiblePaths = entries.filter(ignoreHiddenFiles)
  const submodules = visiblePaths.filter(
    entry => Path.basename(entry.path) === '_git'
  )

  for (const submodule of submodules) {
    const directory = Path.dirname(submodule.path)
    const newPath = Path.join(directory, '.git')
    await FSE.rename(submodule.path, newPath)
  }

  return testRepoPath
}

/**
 * Initializes a new, empty, git repository at in a temporary location.
 *
 * @returns the new local repository
 */
export async function setupEmptyRepository(): Promise<Repository> {
  const repoPath = mkdirSync('desktop-empty-repo-')
  await GitProcess.exec(['init'], repoPath)

  return new Repository(repoPath, -1, null, false)
}

/**
 * Initializes a new, empty, git repository at in a temporary location with
 * default branch of main.
 *
 * @returns the new local repository
 */
export async function setupEmptyRepositoryDefaultMain(): Promise<Repository> {
  const repoPath = mkdirSync('desktop-empty-repo-')
  await GitProcess.exec(['init', '-b', 'main'], repoPath)

  return new Repository(repoPath, -1, null, false)
}

/**
 * Initialize a new, empty folder that is incorrectly associated with a Git
 * repository. This should only be used to test error handling of the Git
 * interactions.
 */
export function setupEmptyDirectory(): Repository {
  const repoPath = mkdirSync('no-repository-here')
  return new Repository(repoPath, -1, null, false)
}

/**
 * Setup a repository and create a merge conflict
 *
 * @returns the new local repository
 *
 * The current branch will be 'other-branch' and the merged branch will be
 * 'master' in your test harness.
 *
 * The conflicted file will be 'foo'.
 */
export async function setupConflictedRepo(): Promise<Repository> {
  const repo = await setupEmptyRepository()

  const firstCommit = {
    entries: [{ path: 'foo', contents: '' }],
  }

  await makeCommit(repo, firstCommit)

  // create this branch starting from the first commit, but don't checkout it
  // because we want to create a divergent history
  await GitProcess.exec(['branch', 'other-branch'], repo.path)

  const secondCommit = {
    entries: [{ path: 'foo', contents: 'b1' }],
  }

  await makeCommit(repo, secondCommit)

  await switchTo(repo, 'other-branch')

  const thirdCommit = {
    entries: [{ path: 'foo', contents: 'b2' }],
  }
  await makeCommit(repo, thirdCommit)

  await GitProcess.exec(['merge', 'master'], repo.path)

  return repo
}

/**
 * Setup a repository and create a merge conflict
 *
 * @returns the new local repository
 *
 * The current branch will be 'other-branch' and the merged branch will be
 * 'master' in your test harness.
 *
 * The conflicted file will be 'foo'. There will also be uncommitted changes unrelated to the merge in 'perlin'.
 */
export async function setupConflictedRepoWithUnrelatedCommittedChange(): Promise<
  Repository
> {
  const repo = await setupEmptyRepository()

  const firstCommit = {
    entries: [
      { path: 'foo', contents: '' },
      { path: 'perlin', contents: 'perlin' },
    ],
  }

  await makeCommit(repo, firstCommit)

  // create this branch starting from the first commit, but don't checkout it
  // because we want to create a divergent history
  await GitProcess.exec(['branch', 'other-branch'], repo.path)

  const secondCommit = {
    entries: [{ path: 'foo', contents: 'b1' }],
  }

  await makeCommit(repo, secondCommit)

  await switchTo(repo, 'other-branch')

  const thirdCommit = {
    entries: [{ path: 'foo', contents: 'b2' }],
  }
  await makeCommit(repo, thirdCommit)

  await writeFile(Path.join(repo.path, 'perlin'), 'noise')

  await GitProcess.exec(['merge', 'master'], repo.path)

  return repo
}

/**
 * Setup a repository and create a merge conflict with multiple files
 *
 * @returns the new local repository
 *
 * The current branch will be 'other-branch' and the merged branch will be
 * 'master' in your test harness.
 *
 * The conflicted files will be 'foo', 'bar', and 'baz'.
 */
export async function setupConflictedRepoWithMultipleFiles(): Promise<
  Repository
> {
  const repo = await setupEmptyRepository()

  const firstCommit = {
    entries: [
      { path: 'foo', contents: 'b0' },
      { path: 'bar', contents: 'b0' },
    ],
  }

  await makeCommit(repo, firstCommit)

  // create this branch starting from the first commit, but don't checkout it
  // because we want to create a divergent history
  await GitProcess.exec(['branch', 'other-branch'], repo.path)

  const secondCommit = {
    entries: [
      { path: 'foo', contents: 'b1' },
      { path: 'bar', contents: null },
      { path: 'baz', contents: 'b1' },
      { path: 'cat', contents: 'b1' },
    ],
  }

  await makeCommit(repo, secondCommit)

  await switchTo(repo, 'other-branch')

  const thirdCommit = {
    entries: [
      { path: 'foo', contents: 'b2' },
      { path: 'bar', contents: 'b2' },
      { path: 'baz', contents: 'b2' },
      { path: 'cat', contents: 'b2' },
    ],
  }

  await makeCommit(repo, thirdCommit)

  await FSE.writeFile(Path.join(repo.path, 'dog'), 'touch')

  await GitProcess.exec(['merge', 'master'], repo.path)

  return repo
}
/**
 * Setup a repo with a single commit
 *
 * files are `great-file` and `good-file`, which are both added in the one commit
 */
export async function setupTwoCommitRepo(): Promise<Repository> {
  const repo = await setupEmptyRepository()

  const firstCommit = {
    entries: [
      { path: 'good-file', contents: 'wishes it was great' },
      { path: 'great-file', contents: 'wishes it was good' },
    ],
  }
  const secondCommit = {
    entries: [
      { path: 'good-file', contents: 'is great' },
      { path: 'great-file', contents: 'is good' },
    ],
  }

  await makeCommit(repo, firstCommit)
  await makeCommit(repo, secondCommit)
  return repo
}

/**
 * Sets up a local fork of the provided repository
 * and configures the origin remote to point to the
 * local "upstream" repository.
 */
export async function setupLocalForkOfRepository(
  upstream: Repository
): Promise<Repository> {
  const path = mkdirSync('desktop-fork-repo-')
  await git(['clone', '--local', `${upstream.path}`, path], path, 'clone')
  return new Repository(path, -1, null, false)
}
