import * as Os from 'os'
import * as Path from 'path'
import * as FSE from 'fs-extra'

import { git } from './core'

import { Repository, LinkedWorkTree } from '../../models/repository'
import { getMatches } from '../helpers/regex'

/** Enumerate the list of work trees reported by Git for a repository */
export async function listWorkTrees(
  repository: Repository
): Promise<ReadonlyArray<LinkedWorkTree>> {
  const result = await git(
    ['worktree', 'list', '--porcelain'],
    repository.path,
    'listWorkTrees'
  )

  const worktrees = new Array<LinkedWorkTree>()

  // the porcelain output from git-worktree covers multiple lines
  const listWorkTreeRe = /worktree (.*)\nHEAD ([a-f0-9]*)\n(branch .*|detached)\n/gm

  getMatches(result.stdout, listWorkTreeRe).forEach(m => {
    if (m.length === 4) {
      worktrees.push({
        path: m[1],
        head: m[2],
      })
    } else {
      log.debug(
        `[listWorkTrees] match '${
          m[0]
        }' does not have the expected data or output. Skipping...`
      )
    }
  })

  return worktrees
}

/**
 * Creates a temporary work tree for use in Desktop, even if one already exists
 * for that repository. Won't modify the repository's working directory.
 * _The returned worktree will be checked out to the given commit._
 */
export async function createWorkTree(
  repository: Repository,
  commit: string
): Promise<LinkedWorkTree> {
  const directory = await FSE.mkdtemp(getTemporaryDirectoryPrefix())
  await addWorkTree(repository, directory, commit)
  // Because Git doesn't give enough information from stdout for the previous
  // Git call, this function enumerates the available worktrees to find the
  // expected worktree

  // we want these ordered most recently created first
  const workTrees: ReadonlyArray<LinkedWorkTree> = Array.from(
    await listWorkTrees(repository)
  ).reverse()

  const directoryName = Path.basename(directory)
  const workTree = workTrees.find(t => Path.basename(t.path) === directoryName)

  // intentionally vague here to cover `undefined` and `null`
  if (!workTree) {
    throw new Error(
      `[addWorkTree] Unable to find created worktree at path ${directory}`
    )
  }

  return workTree
}

/**
 * Create a new work tree at the desired location on disk, checked
 * out to the given commit
 */
async function addWorkTree(
  repository: Repository,
  path: string,
  commit: string
): Promise<void> {
  await git(
    ['worktree', 'add', '-f', path, commit],
    repository.path,
    'addWorkTree'
  )
}

/** Nicer external API for `removeWorkTree` */
export async function destroyWorkTree(
  repository: Repository,
  workTree: LinkedWorkTree
): Promise<true> {
  return await removeWorkTree(repository.path, workTree.path)
}

/** Cleanup the temporary worktree at a given location */
async function removeWorkTree(
  repositoryPath: string,
  workTreePath: string
): Promise<true> {
  await git(
    ['worktree', 'remove', '-f', workTreePath],
    repositoryPath,
    'removeWorkTree'
  )
  return true
}

const DesktopWorkTreePrefix = 'github-desktop-worktree-'

function getTemporaryDirectoryPrefix() {
  return Path.join(Os.tmpdir(), DesktopWorkTreePrefix)
}

async function findTemporaryWorkTrees(
  repository: Repository
): Promise<ReadonlyArray<LinkedWorkTree>> {
  const workTrees = await listWorkTrees(repository)

  // always exclude the first entry as that will be "main" worktree and we
  // should not even look at it funny
  const candidateWorkTrees = workTrees.slice(1)

  return candidateWorkTrees.filter(t => {
    // NOTE:
    // we can't reliably check the full path here because Git seems to be
    // prefixing the temporary paths on macOS with a `/private` prefix, and
    // NodeJS doesn't seem to include this when we ask for the temporary
    // directory for the OS
    const directoryName = Path.basename(t.path)
    return directoryName.startsWith(DesktopWorkTreePrefix)
  })
}

/**
 * Finds an existing temporary work tree for use in Desktop or creates a new one.
 * Won't modify the repository's working directory.
 * _The returned worktree will be checked out to the given commit._
 */
export async function findOrCreateTemporaryWorkTree(
  repository: Repository,
  commit: string
): Promise<LinkedWorkTree> {
  const temporaryWorkTrees = await findTemporaryWorkTrees(repository)

  if (temporaryWorkTrees.length === 0) {
    return await createWorkTree(repository, commit)
  }

  const worktreeForDesktop = temporaryWorkTrees[0]

  await git(['checkout', commit], worktreeForDesktop.path, 'checkoutWorkTree')

  return worktreeForDesktop
}

/** find the existing worktree, but if that fails make a new one */
export async function ensureWorkTree(
  repository: Repository,
  sha: string
): Promise<LinkedWorkTree> {
  try {
    return await findOrCreateTemporaryWorkTree(repository, sha)
    // its a little weird that we catch _all_ errors here
    // but if the error is something we can't handle by trying
    // `createWorkTree` directly, then it'll just error again anywyas
  } catch (e) {
    return await createWorkTree(repository, sha)
  }
}

/** Enumerate and cleanup any worktrees generated by Desktop */
export async function cleanupTemporaryWorkTrees(
  repository: Repository
): Promise<void> {
  const temporaryWorkTrees = await findTemporaryWorkTrees(repository)

  for (const workTree of temporaryWorkTrees) {
    await destroyWorkTree(repository, workTree)
  }
}
