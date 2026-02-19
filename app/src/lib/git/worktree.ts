import * as Path from 'path'
import * as Fs from 'fs'
import type { Repository } from '../../models/repository'
import type { WorktreeEntry, WorktreeType } from '../../models/worktree'
import { git } from './core'

export function parseWorktreePorcelainOutput(
  stdout: string
): ReadonlyArray<WorktreeEntry> {
  if (stdout.trim().length === 0) {
    return []
  }

  const blocks = stdout.trim().split('\n\n')
  const entries: WorktreeEntry[] = []

  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i].split('\n')
    let path = ''
    let head = ''
    let branch: string | null = null
    let isDetached = false
    let isLocked = false
    let isPrunable = false

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        path = line.substring('worktree '.length)
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
  repository: Repository
): Promise<ReadonlyArray<WorktreeEntry>> {
  const result = await git(
    ['worktree', 'list', '--porcelain'],
    repository.path,
    'listWorktrees'
  )

  return parseWorktreePorcelainOutput(result.stdout)
}

export async function addWorktree(
  repository: Repository,
  path: string,
  options: {
    readonly branch?: string
    readonly createBranch?: string
    readonly detach?: boolean
    readonly commitish?: string
  } = {}
): Promise<void> {
  const args = ['worktree', 'add']

  if (options.detach) {
    args.push('--detach')
  }

  if (options.createBranch) {
    args.push('-b', options.createBranch)
  }

  args.push(path)

  if (options.branch) {
    args.push(options.branch)
  } else if (options.commitish) {
    args.push(options.commitish)
  }

  await git(args, repository.path, 'addWorktree')
}

export async function removeWorktree(
  repository: Repository,
  path: string,
  force: boolean = false
): Promise<void> {
  const args = ['worktree', 'remove']
  if (force) {
    args.push('--force')
  }
  args.push(path)

  await git(args, repository.path, 'removeWorktree')
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

export async function isLinkedWorktree(
  repository: Repository
): Promise<boolean> {
  const worktrees = await listWorktrees(repository)
  const repoPath = repository.path

  return worktrees.some(
    wt =>
      wt.type === 'linked' && normalizePath(wt.path) === normalizePath(repoPath)
  )
}

export async function getMainWorktreePath(
  repository: Repository
): Promise<string | null> {
  const worktrees = await listWorktrees(repository)
  const main = worktrees.find(wt => wt.type === 'main')
  return main?.path ?? null
}

/**
 * Synchronously checks if a repository path is a linked worktree by examining
 * whether `.git` is a file (linked worktree) or directory (main worktree).
 */
export function isLinkedWorktreeSync(repositoryPath: string): boolean {
  try {
    const dotGit = Path.join(repositoryPath, '.git')
    // eslint-disable-next-line no-sync
    const stats = Fs.statSync(dotGit)
    return stats.isFile()
  } catch {
    return false
  }
}

function normalizePath(p: string): string {
  return p.replace(/\/+$/, '')
}
