import { spawn } from 'child_process'

export function isGitOnPath(): Promise<boolean> {
  // Modern versions of macOS ship with a Git shim that guides you through
  // the process of setting everything up. We trust this is available, so
  // don't worry about looking for it here.
  // I decide linux user have git too :)
  if (__DARWIN__ || __LINUX__) {
    return Promise.resolve(true)
  }

  // adapted from http://stackoverflow.com/a/34953561/1363815
  return new Promise<boolean>((resolve, reject) => {
    const process = spawn('where', ['git'])

    if (__WIN32__) {
      // `where` will return 0 when the executable
      // is found under PATH, or 1 if it cannot be found
      process.on('close', function(code) {
        resolve(code === 0)
      })
      return
    }

    // in case you're on a non-Windows/non-macOS platform
    resolve(false)
  })
}
