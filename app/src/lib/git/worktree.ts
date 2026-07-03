import * as Path from 'path'
import type { Repository } from '../../models/repository'
import type { WorktreeEntry, WorktreeType } from '../../models/worktree'
import { git } from './core'
import { pathExists } from '../path-exists'

export function parseWorktreePorcelainOutput(
  stdout: string
): ReadonlyArray<WorktreeEntry> {
  if (stdout.trim().length === 0) {
    return []
  }

  // With -z, worktree blocks are separated by double NUL and fields within
  // a block are separated by single NUL
  const blocks = stdout.replace(/\0$/, '').split('\0\0')
  const entries: WorktreeEntry[] = []

  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i].split('\0')
    let path = ''
    let head = ''
    let branch: string | null = null
    let isDetached = false
    let isLocked = false
    let isPrunable = false

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        // Git for Windows will output paths using forward slashes, i.e.
        // c:/Users/niik/... but repositories added in Desktop always pass
        // through getRepositoryType which uses path.resolve to deduce the
        // absolute top level directory and that will normalize paths as well
        // so by normalizing here we can be more confident about comparing paths
        path = Path.normalize(line.substring('worktree '.length))
      } else if (line.startsWith('HEAD ')) {
        head = line.substring('HEAD '.length)
      } else if (line.startsWith('branch ')) {
        branch = line.substring('branch '.length)
      } else if (line === 'detached') {
        isDetached = true
      } else if (line === 'locked' || line.startsWith('locked ')) {
        isLocked = true
      } else if (line === 'prunable' || line.startsWith('prunable ')) {
        isPrunable = true
      }
    }

    const type: WorktreeType = i === 0 ? 'main' : 'linked'
    entries.push({ path, head, branch, isDetached, type, isLocked, isPrunable })
  }

  return entries
}

export async function listWorktrees(
  repositoryOrPath: Repository | string
): Promise<ReadonlyArray<WorktreeEntry>> {
  const result = await git(
    ['worktree', 'list', '--porcelain', '-z'],
    typeof repositoryOrPath === 'string'
      ? repositoryOrPath
      : repositoryOrPath.path,
    'listWorktrees'
  )

  return parseWorktreePorcelainOutput(result.stdout)
}

/**
 * When a repository's working directory no longer exists on disk (for example a
 * linked worktree that has been removed by an external tool), resolve the *main*
 * worktree of the same repository so the app can fall back to it instead of
 * treating the repository as missing.
 *
 * A linked worktree's administrative git dir (`.git/worktrees/<name>`, i.e.
 * `repository.resolvedGitDir`) survives deletion of the working directory, so
 * the set of worktrees — including the still-present main worktree — can still
 * be enumerated from it even once `repository.path` is gone.
 *
 * Returns `null` when no main worktree can be resolved, e.g. a regular,
 * non-worktree repository that has genuinely been deleted (its git dir is gone
 * too) or a repository that is itself the main worktree.
 */
export async function getMainWorktree(
  repository: Repository
): Promise<WorktreeEntry | null> {
  const gitDir = repository.resolvedGitDir

  if (!(await pathExists(gitDir))) {
    return null
  }

  try {
    const main = (await listWorktrees(gitDir)).find(w => w.type === 'main')
    return main !== undefined && (await pathExists(main.path)) ? main : null
  } catch {
    // Degrade to the existing "missing" behaviour rather than crashing a
    // refresh if git is unable to enumerate the worktrees for some reason.
    return null
  }
}

export async function addWorktree(
  repository: Repository,
  path: string,
  options: {
    /** Branch name used with -b (create new branch) */
    readonly createBranch?: string
    /** Commit-ish to check out (branch name, ref, or SHA) */
    readonly commitish?: string
  } = {}
): Promise<void> {
  const args = ['worktree', 'add']

  if (options.createBranch) {
    args.push('-b', options.createBranch)
  }

  args.push(path)

  if (options.commitish) {
    args.push(options.commitish)
  }

  await git(args, repository.path, 'addWorktree')
}

export async function removeWorktree(
  repositoryPath: string,
  worktreePath: string,
  force: boolean = false
): Promise<void> {
  const args = ['worktree', 'remove']
  if (force) {
    args.push('--force')
  }
  args.push(worktreePath)

  await git(args, repositoryPath, 'removeWorktree')
}

export async function moveWorktree(
  repository: Repository,
  oldPath: string,
  newPath: string
): Promise<void> {
  await git(
    ['worktree', 'move', oldPath, newPath],
    repository.path,
    'moveWorktree'
  )
}
