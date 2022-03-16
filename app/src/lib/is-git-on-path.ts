import { execFile } from './exec-file'

const findOnPath = (program: string) => {
  return execFile('which', [program])
}

/** Attempts to locate the path to the system version of Git */
export const findGitOnPath = () =>
  // `where` (i.e on Windows) will list _all_ PATH components where the
  // executable is found, one per line, and return 0, or print an error and
  // return 1 if it cannot be found.
  //
  // `which` (i.e. on macOS and Linux) will print the path and return 0
  // when the executable is found under PATH, or return 1 if it cannot be found
  findOnPath('git')
    .then(({ stdout }) => stdout.split(/\r?\n/, 1)[0])
    .catch(err => {
      log.warn(`Failed trying to find Git on PATH`, err)
      return undefined
    })

/** Returns a value indicating whether Git was found in the system's PATH */
export const isGitOnPath = async () =>
  // Modern versions of macOS ship with a Git shim that guides you through
  // the process of setting everything up. We trust this is available, so
  // don't worry about looking for it here.
  __DARWIN__ || (await findGitOnPath()) !== undefined
