import * as Fs from 'fs'
import * as Path from 'path'

const runas: (
  command: string,
  args: ReadonlyArray<string>,
  options?: { admin: boolean }
) => number = require('runas')

/** The path for the installed command line tool. */
export const InstalledCLIPath = '/usr/local/bin/github'

/** The path to the packaged CLI. */
const PackagedPath = Path.resolve(__dirname, 'static', 'github.sh')

/** Install the command line tool on macOS. */
export async function installCLI(): Promise<void> {
  const installedPath = await getResolvedInstallPath()
  if (installedPath === PackagedPath) {
    return
  }

  try {
    symlinkCLI(false)
  } catch (e) {
    // If we error without running as an admin, try again as an admin.
    symlinkCLI(true)
  }
}

async function getResolvedInstallPath(): Promise<string | null> {
  return new Promise<string | null>((resolve, reject) => {
    Fs.readlink(InstalledCLIPath, (err, realpath) => {
      if (err) {
        resolve(null)
      } else {
        resolve(realpath)
      }
    })
  })
}

function symlinkCLI(asAdmin: boolean) {
  let exitCode = runas('/bin/rm', ['-f', InstalledCLIPath], { admin: asAdmin })
  if (exitCode !== 0) {
    throw new Error(
      `Failed to remove file at ${InstalledCLIPath}. Authorization of GitHub Desktop Helper is required.`
    )
  }

  exitCode = runas('/bin/mkdir', ['-p', Path.dirname(InstalledCLIPath)], {
    admin: asAdmin,
  })
  if (exitCode !== 0) {
    throw new Error(
      `Failed to create intermediate directories to ${InstalledCLIPath}`
    )
  }

  exitCode = runas('/bin/ln', ['-s', PackagedPath, InstalledCLIPath], {
    admin: asAdmin,
  })
  if (exitCode !== 0) {
    throw new Error(`Failed to symlink ${PackagedPath} to ${InstalledCLIPath}`)
  }
}
