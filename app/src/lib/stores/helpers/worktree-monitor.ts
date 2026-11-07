import { readdir, readFile } from 'fs/promises'
import * as Path from 'path'
import { pathExists } from '../../path-exists'

/** How often, in milliseconds, to look for worktrees added or removed. */
const DefaultWorktreeMonitorInterval = 5 * 1000

/** Remove the line endings Git allows at the end of its pointer files. */
const trimLineEndings = (content: string) => content.replace(/[\r\n]+$/, '')

/**
 * Resolve a `.git` file to the git dir it points to, the way Git does.
 *
 * Linked worktrees, submodules and repositories created with
 * `--separate-git-dir` have a `.git` file rather than a `.git` directory, which
 * is what `Repository.resolvedGitDir` falls back to when a repository's git
 * dir hasn't been recorded yet. Any other path is returned as is.
 */
async function resolveGitFile(gitDir: string): Promise<string> {
  const prefix = 'gitdir: '
  const content = await readFile(gitDir, 'utf8').catch(() => null)

  return content !== null && content.startsWith(prefix)
    ? Path.resolve(
        Path.dirname(gitDir),
        trimLineEndings(content.substring(prefix.length))
      )
    : gitDir
}

/**
 * Get the directory in which Git keeps the administrative files of a
 * repository's linked worktrees, `<common git dir>/worktrees`.
 *
 * The git dir of a linked worktree points to the common git dir in its
 * `commondir` file, which we read rather than spawning Git (see
 * `listSubmodules`). Any other git dir is the common git dir itself.
 *
 * @param gitDir The git dir of the repository, or a `.git` file pointing to it.
 */
export async function getWorktreesDirectory(gitDir: string): Promise<string> {
  const resolvedGitDir = await resolveGitFile(gitDir)
  const commonDir = await readFile(
    Path.join(resolvedGitDir, 'commondir'),
    'utf8'
  )
    .then(trimLineEndings)
    .then(dir =>
      dir.length > 0 ? Path.resolve(resolvedGitDir, dir) : resolvedGitDir
    )
    .catch(() => resolvedGitDir)

  return Path.join(commonDir, 'worktrees')
}

/**
 * Get the names of the administrative directories of the linked worktrees in
 * the given worktrees directory, along with whether each of them is locked so
 * that we notice Git releasing the lock it holds while adding a worktree.
 */
async function getWorktreesSnapshot(worktreesDir: string): Promise<string> {
  const names = await readdir(worktreesDir).catch(() => [])
  const entries = await Promise.all(
    names
      .sort()
      .map(async name =>
        (await pathExists(Path.join(worktreesDir, name, 'locked')))
          ? `${name} (locked)`
          : name
      )
  )

  return JSON.stringify(entries)
}

/**
 * Monitor a repository for linked worktrees being added or removed by other
 * tools, such as the GitHub Copilot app or the Git CLI.
 *
 * The worktree list is otherwise only reloaded when Desktop's window regains
 * focus, so worktrees added while it's in the background wouldn't show up.
 *
 * This polls the directory Git keeps the worktrees' administrative files in,
 * which is cheap and behaves the same on every platform and file system,
 * rather than watching it, which would mean holding the directory open.
 *
 * @param gitDir   The git dir of the repository.
 * @param onChange Called whenever worktrees are added, removed, locked or
 *                 unlocked.
 * @param interval How often, in milliseconds, to look for changes.
 * @returns A function which stops monitoring the repository.
 */
export function monitorWorktrees(
  gitDir: string,
  onChange: () => void,
  interval: number = DefaultWorktreeMonitorInterval
): () => void {
  let stopped = false
  let timeoutHandle: number | null = null

  const schedule = (worktreesDir: string, previousSnapshot: string) => {
    timeoutHandle = window.setTimeout(async () => {
      const snapshot = await getWorktreesSnapshot(worktreesDir)

      if (stopped) {
        return
      }

      schedule(worktreesDir, snapshot)

      if (snapshot !== previousSnapshot) {
        onChange()
      }
    }, interval)
  }

  getWorktreesDirectory(gitDir)
    .then(async worktreesDir => {
      const snapshot = await getWorktreesSnapshot(worktreesDir)

      if (!stopped) {
        schedule(worktreesDir, snapshot)
      }
    })
    .catch(e => log.error(`Could not monitor worktrees in '${gitDir}'`, e))

  return () => {
    stopped = true

    if (timeoutHandle !== null) {
      window.clearTimeout(timeoutHandle)
      timeoutHandle = null
    }
  }
}
