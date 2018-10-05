import { findExecutableOnPath } from './find-executable'

export function isGitOnPath(): Promise<boolean> {
  // Modern versions of macOS ship with a Git shim that guides you through
  // the process of setting everything up. We trust this is available, so
  // don't worry about looking for it here.
  if (__DARWIN__) {
    return Promise.resolve(true)
  }

  return findExecutableOnPath('git').then(value => value !== null)
}
