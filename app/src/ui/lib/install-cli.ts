import * as Path from 'path'

import * as fsAdmin from 'fs-admin'
import { mkdir, readlink, symlink, unlink } from 'fs/promises'

/** The path for the installed command line tool. */
export const InstalledCLIPath = '/usr/local/bin/github'

/** Shorter alias for the CLI. */
const InstalledCLIAliasPath = '/usr/local/bin/github-plus'

/** The path to the packaged CLI. */
const PackagedPath = Path.resolve(__dirname, 'static', 'github.sh')

/** Install the command line tool on macOS. */
export async function installCLI(): Promise<void> {
  await installCLIAt(InstalledCLIPath)
  await installCLIAt(InstalledCLIAliasPath)
}

async function installCLIAt(installPath: string): Promise<void> {
  const resolvedPath = await getResolvedInstallPath(installPath)
  if (resolvedPath === PackagedPath) {
    return
  }

  try {
    await symlinkCLI(installPath, false)
  } catch (e) {
    // If we error without running as an admin, try again as an admin.
    await symlinkCLI(installPath, true)
  }
}

async function getResolvedInstallPath(
  installPath: string
): Promise<string | null> {
  try {
    return await readlink(installPath)
  } catch {
    return null
  }
}

function removeExistingSymlink(installPath: string, asAdmin: boolean) {
  if (!asAdmin) {
    return unlink(installPath)
  }

  return new Promise<void>((resolve, reject) => {
    fsAdmin.unlink(installPath, error => {
      if (error !== null) {
        reject(
          new Error(
            `Failed to remove file at ${installPath}. Authorization of GitHub Desktop Helper is required.`
          )
        )
        return
      }

      resolve()
    })
  })
}

function createDirectories(installPath: string, asAdmin: boolean) {
  const path = Path.dirname(installPath)

  if (!asAdmin) {
    return mkdir(path, { recursive: true })
  }

  return new Promise<void>((resolve, reject) => {
    fsAdmin.makeTree(path, error => {
      if (error !== null) {
        reject(
          new Error(
            `Failed to create intermediate directories to ${installPath}`
          )
        )
        return
      }

      resolve()
    })
  })
}

function createNewSymlink(installPath: string, asAdmin: boolean) {
  if (!asAdmin) {
    return symlink(PackagedPath, installPath)
  }

  return new Promise<void>((resolve, reject) => {
    fsAdmin.symlink(PackagedPath, installPath, error => {
      if (error !== null) {
        reject(
          new Error(`Failed to symlink ${PackagedPath} to ${installPath}`)
        )
        return
      }

      resolve()
    })
  })
}

async function symlinkCLI(installPath: string, asAdmin: boolean): Promise<void> {
  await removeExistingSymlink(installPath, asAdmin)
  await createDirectories(installPath, asAdmin)
  await createNewSymlink(installPath, asAdmin)
}
