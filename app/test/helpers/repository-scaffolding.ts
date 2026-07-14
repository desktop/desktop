import { exec } from 'dugite'
import { writeFile } from 'fs/promises'
import * as Path from 'path'
import { TestContext } from 'node:test'

import { Repository } from '../../src/models/repository'
import { createTempDirectory } from './temp'

type TreeEntry = {
  /** The relative path of the file in the repository */
  readonly path: string
  /**
   * The contents associated with the current path.
   *
   * Use `null` to remove the file from the working directory before committing
   */
  readonly contents: Buffer | string | null
}

type Tree = {
  readonly entries: ReadonlyArray<TreeEntry>
  /**
   * Optional commit message to pass to Git.
   *
   * If undefined, `'commit'` will be used.
   */
  readonly commitMessage?: string
}

/**
 * Clone a local Git repository to a new temporary directory, so that
 * push/pull/fetch operations can be tested without requiring the network.
 */
export async function cloneRepository(
  t: TestContext,
  repository: Repository
): Promise<Repository> {
  const newDirectory = await createTempDirectory(t)

  await exec(['clone', repository.path, '--', newDirectory], __dirname)

  return new Repository(newDirectory, -2, null, false)
}

/**
 * Make a commit tot he repository by creating the specified files in the
 * working directory, staging all changes, and then committing with the
 * specified message.
 */
export async function makeCommit(repository: Repository, tree: Tree) {
  for (const entry of tree.entries) {
    const fullPath = Path.join(repository.path, entry.path)
    if (entry.contents === null) {
      await exec(['rm', entry.path], repository.path)
    } else {
      await writeFile(fullPath, entry.contents)
      await exec(['add', entry.path], repository.path)
    }
  }

  const message = tree.commitMessage || 'commit'
  await exec(['commit', '-m', message], repository.path)
}

export async function createBranch(
  repository: Repository,
  branch: string,
  startPoint: string
) {
  const result = await exec(['rev-parse', '--verify', branch], repository.path)

  if (result.exitCode === 128) {
    // ref does not exists, checkout and create the branch
    await exec(['branch', branch, startPoint], repository.path)
  } else {
    throw new Error(
      `Branch ${branch} already exists and resolves to '${result.stdout}'`
    )
  }
}

export async function switchTo(repository: Repository, branch: string) {
  const result = await exec(['rev-parse', '--verify', branch], repository.path)

  if (result.exitCode === 128) {
    // ref does not exists, checkout and create the branch
    await exec(['checkout', '-b', branch], repository.path)
  } else {
    // just switch to the branch
    await exec(['checkout', branch], repository.path)
  }
}

export async function cloneLocalRepository(
  t: TestContext,
  repository: Repository
): Promise<Repository> {
  const repoPath = await createTempDirectory(t)
  const args = ['clone', '--', repository.path, repoPath]
  const result = await exec(args, repository.path)

  if (result.exitCode === 128) {
    throw new Error(JSON.stringify(result))
  } else {
    return new Repository(repoPath, -1, null, true)
  }
}
