import { git } from './core'
import { Repository } from '../../models/repository'

/**
 * Format a local branch in the ref syntax, ensuring situations when the branch
 * is ambiguous are handled.
 *
 * Examples:
 *  - master -> refs/heads/master
 *  - heads/Microsoft/master -> refs/heads/Microsoft/master
 *
 * @param branch The local branch name
 */
export function formatAsLocalRef(name: string): string {
  if (name.startsWith('heads/')) {
    // In some cases, Git will report this name explicitly to distingush from
    // a remote ref with the same name - this ensures we format it correctly.
    return `refs/${name}`
  } else if (!name.startsWith('refs/heads/')) {
    // By default Git will drop the heads prefix unless absolutely necessary
    // - include this to ensure the ref is fully qualified.
    return `refs/heads/${name}`
  } else {
    return name
  }
}

/**
 * Read a symbolic ref from the repository.
 *
 * Symbolic refs are used to point to other refs, similar to how symlinks work
 * for files. Because refs can be removed easily from a Git repository,
 * symbolic refs should only be used when absolutely necessary.
 *
 * @param repository The repository to lookup
 * @param ref The symbolic ref to resolve
 *
 * @returns the canonical ref, if found, or `null` if `ref` cannot be found or
 *          is not a symbolic ref
 */
export async function getSymbolicRef(
  repository: Repository,
  ref: string
): Promise<string | null> {
  const result = await git(
    ['symbolic-ref', '-q', ref],
    repository.path,
    'getSymbolicRef',
    {
      //  - 1 is the exit code that Git throws in quiet mode when the ref is not a
      //    symbolic ref
      //  - 128 is the generic error code that Git returns when it can't find
      //    something
      successExitCodes: new Set([0, 1, 128]),
    }
  )

  if (result.exitCode === 1 || result.exitCode === 128) {
    return null
  }

  return result.stdout.trim()
}
