import * as Path from 'path'
import { execFile, spawn, SpawnOptions } from 'child_process'
import type { Dirent } from 'fs'
import { promisify } from 'util'
import { readdir } from 'fs/promises'

import { pathExists } from '../ui/lib/path-exists'
import { ExternalEditorError } from './editors/shared'

const execFileAsync = promisify(execFile)

const ignoredDirectories = new Set([
  '.git',
  '.vs',
  'bin',
  'node_modules',
  'obj',
  'packages',
])

async function getVisualStudioPathFromVswhere(): Promise<string | null> {
  const installerRoots = [
    process.env['ProgramFiles(x86)'],
    process.env.ProgramFiles,
  ].filter((path): path is string => path !== undefined)

  for (const root of installerRoots) {
    const vswherePath = Path.join(
      root,
      'Microsoft Visual Studio',
      'Installer',
      'vswhere.exe'
    )

    if (!(await pathExists(vswherePath))) {
      continue
    }

    try {
      const { stdout: productPathOutput } = await execFileAsync(vswherePath, [
        '-latest',
        '-products',
        '*',
        '-property',
        'productPath',
      ])
      const productPath = String(productPathOutput).trim()

      if (productPath.length > 0 && (await pathExists(productPath))) {
        return productPath
      }

      const { stdout: installPathOutput } = await execFileAsync(vswherePath, [
        '-latest',
        '-products',
        '*',
        '-property',
        'installationPath',
      ])
      const installPath = String(installPathOutput).trim()
      const devenvPath = Path.join(installPath, 'Common7', 'IDE', 'devenv.exe')

      if (await pathExists(devenvPath)) {
        return devenvPath
      }
    } catch (e) {
      log.warn('Unable to resolve Visual Studio using vswhere', e)
    }
  }

  return null
}

async function getVisualStudioPathFromKnownLocations(): Promise<string | null> {
  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files'
  const editions = ['Enterprise', 'Professional', 'Community', 'Preview']
  const years = ['2022', '2019', '2017']

  for (const year of years) {
    for (const edition of editions) {
      const devenvPath = Path.join(
        programFiles,
        'Microsoft Visual Studio',
        year,
        edition,
        'Common7',
        'IDE',
        'devenv.exe'
      )

      if (await pathExists(devenvPath)) {
        return devenvPath
      }
    }
  }

  return null
}

async function findVisualStudioPath(): Promise<string | null> {
  return (
    (await getVisualStudioPathFromVswhere()) ??
    (await getVisualStudioPathFromKnownLocations())
  )
}

async function findProjectFile(repositoryPath: string): Promise<string | null> {
  const directories = [repositoryPath]
  let fallbackProject: string | null = null

  while (directories.length > 0) {
    const directory = directories.shift()

    if (directory === undefined) {
      continue
    }

    let entries: ReadonlyArray<Dirent>
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (e) {
      log.warn(`Unable to inspect '${directory}' for Visual Studio projects`, e)
      continue
    }

    const sortedEntries = [...entries].sort((a, b) =>
      a.name.localeCompare(b.name)
    )

    for (const entry of sortedEntries) {
      const fullPath = Path.join(directory, entry.name)
      const lowerCaseName = entry.name.toLowerCase()

      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(lowerCaseName)) {
          directories.push(fullPath)
        }
        continue
      }

      if (entry.isFile() && lowerCaseName.endsWith('.sln')) {
        return fullPath
      }

      if (
        fallbackProject === null &&
        entry.isFile() &&
        lowerCaseName.endsWith('.csproj')
      ) {
        fallbackProject = fullPath
      }
    }
  }

  return fallbackProject
}

export async function isVisualStudioAvailable(repositoryPath: string) {
  if (!__WIN32__) {
    return false
  }

  return (
    (await findVisualStudioPath()) !== null &&
    (await findProjectFile(repositoryPath)) !== null
  )
}

export async function launchVisualStudio(repositoryPath: string) {
  if (!__WIN32__) {
    throw new ExternalEditorError(
      'Visual Studio IDE integration is only available on Windows.'
    )
  }

  const visualStudioPath = await findVisualStudioPath()

  if (visualStudioPath === null) {
    throw new ExternalEditorError(
      'Visual Studio IDE could not be found. Install Visual Studio or make sure vswhere.exe is available, then try again.'
    )
  }

  const projectPath = await findProjectFile(repositoryPath)

  if (projectPath === null) {
    throw new ExternalEditorError(
      'No Visual Studio solution or C# project could be found in this repository.'
    )
  }

  return new Promise<void>((resolve, reject) => {
    const opts: SpawnOptions = {
      detached: true,
      stdio: 'ignore',
    }
    const child = spawn(visualStudioPath, [projectPath], opts)

    child.on('error', reject)
    child.on('spawn', resolve)
    child.unref()
  }).catch((e: unknown) => {
    log.error(
      'Error while launching Visual Studio IDE',
      e instanceof Error ? e : undefined
    )
    throw new ExternalEditorError(
      'Something went wrong while trying to start Visual Studio IDE.'
    )
  })
}
