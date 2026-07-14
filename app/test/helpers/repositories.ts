import { createTempDirectory } from './temp'
import { Repository } from '../../src/models/repository'
import { exec } from 'dugite'
import { makeCommit, switchTo } from './repository-scaffolding'
import { glob, writeFile, cp, mkdir, rename, rm } from 'fs/promises'
import { DefaultGitDescription, git } from '../../src/lib/git'
import { TestContext } from 'node:test'
import { dirname, join } from 'path'

/**
 * Set up the named fixture repository to be used in a test.
 *
 * @returns The path to the set up fixture repository.
 */
export async function setupFixtureRepository(
  t: TestContext,
  repositoryName: string
): Promise<string> {
  const fixturePath = join(__dirname, '..', 'fixtures', repositoryName)
  const testRepoPath = await createTempDirectory(t)
  await cp(fixturePath, testRepoPath, { recursive: true })

  for await (const e of glob('**/_git', { cwd: testRepoPath })) {
    await rename(join(testRepoPath, e), join(testRepoPath, dirname(e), '.git'))
  }

  return testRepoPath
}

/**
 * Initializes a new, empty, git repository at in a temporary location.
 *
 * @returns the new local repository
 */
export async function setupEmptyRepository(
  t: TestContext,
  defaultBranchName = 'master'
): Promise<Repository> {
  const repoPath = await createTempDirectory(t)

  await mkdir(join(repoPath, '.git'))
  await mkdir(join(repoPath, '.git/objects'))
  await mkdir(join(repoPath, '.git/refs'))
  await mkdir(join(repoPath, '.git/refs/tags'))
  await mkdir(join(repoPath, '.git/refs/heads'))
  await mkdir(join(repoPath, '.git/info'))

  const headRef = `ref: refs/heads/${defaultBranchName}\n`

  await Promise.all([
    writeFile(join(repoPath, '.git/HEAD'), headRef),
    writeFile(
      join(repoPath, '.git/config'),
      `[core]
repositoryformatversion = 0
filemode = true
bare = false
logallrefupdates = true
ignorecase = ${process.platform === 'linux' ? 'true' : 'false'}
precomposeunicode = true
`
    ),
    writeFile(join(repoPath, '.git/description'), DefaultGitDescription),
  ])

  return new Repository(repoPath, -1, null, false)
}

/**
 * Initializes a new, empty, git repository at in a temporary location with
 * default branch of main.
 *
 * @returns the new local repository
 */
export const setupEmptyRepositoryDefaultMain = (t: TestContext) =>
  setupEmptyRepository(t, 'main')

/**
 * Initialize a new, empty folder that is incorrectly associated with a Git
 * repository. This should only be used to test error handling of the Git
 * interactions.
 */
export async function setupEmptyDirectory(t: TestContext) {
  const repoPath = await createTempDirectory(t)
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
export async function setupConflictedRepo(t: TestContext): Promise<Repository> {
  const repo = await setupEmptyRepository(t)

  const firstCommit = {
    entries: [{ path: 'foo', contents: '' }],
  }

  await makeCommit(repo, firstCommit)

  // create this branch starting from the first commit, but don't checkout it
  // because we want to create a divergent history
  await exec(['branch', 'other-branch'], repo.path)

  const secondCommit = {
    entries: [{ path: 'foo', contents: 'b1' }],
  }

  await makeCommit(repo, secondCommit)

  await switchTo(repo, 'other-branch')

  const thirdCommit = {
    entries: [{ path: 'foo', contents: 'b2' }],
  }
  await makeCommit(repo, thirdCommit)

  await exec(['merge', 'master'], repo.path)

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
export async function setupConflictedRepoWithUnrelatedCommittedChange(
  t: TestContext
): Promise<Repository> {
  const repo = await setupEmptyRepository(t)

  const firstCommit = {
    entries: [
      { path: 'foo', contents: '' },
      { path: 'perlin', contents: 'perlin' },
    ],
  }

  await makeCommit(repo, firstCommit)

  // create this branch starting from the first commit, but don't checkout it
  // because we want to create a divergent history
  await exec(['branch', 'other-branch'], repo.path)

  const secondCommit = {
    entries: [{ path: 'foo', contents: 'b1' }],
  }

  await makeCommit(repo, secondCommit)

  await switchTo(repo, 'other-branch')

  const thirdCommit = {
    entries: [{ path: 'foo', contents: 'b2' }],
  }
  await makeCommit(repo, thirdCommit)

  await writeFile(join(repo.path, 'perlin'), 'noise')

  await exec(['merge', 'master'], repo.path)

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
export async function setupConflictedRepoWithMultipleFiles(
  t: TestContext
): Promise<Repository> {
  const repo = await setupEmptyRepository(t)

  const firstCommit = {
    entries: [
      { path: 'foo', contents: 'b0' },
      { path: 'bar', contents: 'b0' },
    ],
  }

  await makeCommit(repo, firstCommit)

  // create this branch starting from the first commit, but don't checkout it
  // because we want to create a divergent history
  await exec(['branch', 'other-branch'], repo.path)

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

  await writeFile(join(repo.path, 'dog'), 'touch')

  await exec(['merge', 'master'], repo.path)

  return repo
}
/**
 * Setup a repo with a single commit
 *
 * files are `great-file` and `good-file`, which are both added in the one commit
 */
export async function setupTwoCommitRepo(t: TestContext): Promise<Repository> {
  const repo = await setupEmptyRepository(t)

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
  t: TestContext,
  upstream: Repository
): Promise<Repository> {
  const path = await createTempDirectory(t)
  await git(['clone', '--local', `${upstream.path}`, path], path, 'clone')
  return new Repository(path, -1, null, false)
}

/**
 * Setup a repository with an uninitialized submodule in a branch
 *
 * @returns the new local repository
 *
 * The repository will have:
 * - Two commits on the main branch
 * - A branch named 'branch-with-submodule' with a submodule added
 * - The submodule is uninitialized (its .git/modules entry is removed)
 *
 * This simulates a scenario where a submodule exists in a branch but
 * hasn't been initialized yet when checking out that branch.
 */
export async function setupRepositoryWithUninitializedSubmodule(
  t: TestContext
): Promise<Repository> {
  const repo = await setupTwoCommitRepo(t)

  // Create a submodule repository
  const submoduleRepo = await setupTwoCommitRepo(t)

  // Create a new branch and add the submodule
  await exec(['checkout', '-b', 'branch-with-submodule'], repo.path)

  await exec(
    [
      '-c',
      'protocol.file.allow=always',
      'submodule',
      'add',
      submoduleRepo.path,
      'test-submodule',
    ],
    repo.path
  )
  await exec(['commit', '-m', 'Add submodule'], repo.path)

  // Go back to main branch
  await exec(['checkout', 'master'], repo.path)

  // Remove the .git/modules directory for the submodule to make it uninitialized
  const modulesPath = join(repo.path, '.git', 'modules', 'test-submodule')
  await rm(modulesPath, { recursive: true, force: true })
  await rm(join(repo.path, 'test-submodule'), { recursive: true, force: true })

  return repo
}
