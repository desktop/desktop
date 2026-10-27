import { GitError as DugiteError } from 'dugite'
import { GitError, isAuthFailureError } from './git/core'
import { ErrorWithMetadata } from './error-with-metadata'
import { IFetchAllProgress } from '../models/fetch'

/**
 * How many repositories to fetch at once.
 *
 * High enough that a long list finishes without waiting on one remote at a
 * time, low enough that we don't open a connection per repository.
 */
export const FetchAllConcurrency = 3

/** A repository that could not be fetched. Other repositories still run. */
export interface IFetchAllRepositoryFailure {
  /** Repository id, used to record one failure per repository. */
  readonly id: number
  readonly name: string
  readonly message: string
}

/**
 * Run `worker` over `items` with a fixed concurrency limit.
 *
 * A failure in one item does not stop the others. `onProgress` runs after
 * each item settles, successful or not.
 */
export async function mapWithConcurrency<T>(
  items: ReadonlyArray<T>,
  concurrency: number,
  worker: (item: T) => Promise<void>,
  onProgress: (progress: IFetchAllProgress) => void
): Promise<void> {
  const total = items.length
  if (total === 0) {
    return
  }

  let nextIndex = 0
  let completed = 0
  const workerCount = Math.max(1, Math.min(concurrency, total))

  const run = async () => {
    while (true) {
      const index = nextIndex
      if (index >= total) {
        return
      }
      nextIndex = index + 1

      try {
        await worker(items[index])
      } catch (error) {
        log.error('fetch all repositories worker failed', error)
      } finally {
        completed++
        onProgress({ completed, total })
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => run()))
}

/** Label shown while a fetch-all operation is running. */
export function formatFetchAllProgress(progress: IFetchAllProgress): string {
  return `Fetching ${progress.completed}/${progress.total}`
}

/**
 * One-line summary shown after fetch-all finishes.
 *
 * `total` is the number of repositories that were attempted.
 */
export function formatFetchAllSummary(
  total: number,
  failures: ReadonlyArray<IFetchAllRepositoryFailure>
): string {
  const failed = failures.length
  const fetched = Math.max(0, total - failed)
  const repositoryWord = (count: number) =>
    count === 1 ? 'repository' : 'repositories'

  if (failed === 0) {
    return `Fetched ${fetched} ${repositoryWord(fetched)}.`
  }

  const maxNamedFailures = 2
  const named = failures
    .slice(0, maxNamedFailures)
    .map(failure => `${failure.name} (${failure.message})`)
  const remaining = failed - named.length
  const names =
    remaining > 0
      ? `${named.join(', ')}, and ${remaining} more`
      : named.join(', ')

  if (fetched === 0) {
    return `Could not fetch ${failed} ${repositoryWord(failed)}: ${names}.`
  }

  return `Fetched ${fetched} of ${total} ${repositoryWord(
    total
  )}. ${failed} failed: ${names}.`
}

/** A short, single-line reason suitable for the fetch-all summary banner. */
export function describeFetchAllFailure(error: unknown): string {
  const underlying =
    error instanceof ErrorWithMetadata ? error.underlyingError : error

  if (underlying instanceof GitError && underlying.result.gitError !== null) {
    const gitError = underlying.result.gitError
    if (isAuthFailureError(gitError)) {
      return 'Authentication failed'
    }
    if (
      gitError === DugiteError.HTTPSRepositoryNotFound ||
      gitError === DugiteError.SSHRepositoryNotFound
    ) {
      return 'Repository not found'
    }
    if (gitError === DugiteError.NotAGitRepository) {
      return 'Repository folder is missing'
    }
  }

  const message =
    underlying instanceof Error
      ? underlying.message
      : error instanceof Error
      ? error.message
      : ''

  const line = message.split('\n')[0]?.trim() ?? ''
  if (line.length === 0) {
    return 'Fetch failed'
  }

  const maxLength = 80
  if (line.length <= maxLength) {
    return line
  }

  return `${line.slice(0, maxLength - 1)}…`
}

/** True when Git reports that the working directory is no longer a repository. */
export function isMissingRepositoryError(error: unknown): boolean {
  const underlying =
    error instanceof ErrorWithMetadata ? error.underlyingError : error

  return (
    underlying instanceof GitError &&
    underlying.result.gitError === DugiteError.NotAGitRepository
  )
}
