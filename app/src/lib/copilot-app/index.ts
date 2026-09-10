import appPath from 'app-path'
import { constants } from 'fs'
import { access, stat } from 'fs/promises'
import { homedir } from 'os'
import * as Path from 'path'
import { execFile } from '../exec-file'
import { findWindowsCopilotAppCandidates } from './win32'

export const copilotAppMarketingUrl = 'https://gh.io/app'

type CopilotAppErrorKind = 'not-found' | 'unsupported-version' | 'launch-failed'

/** A discoverable installation or CLI handoff failure. */
export class CopilotAppError extends Error {
  public constructor(
    public readonly kind: CopilotAppErrorKind,
    message: string
  ) {
    super(message)
    this.name = 'CopilotAppError'
  }
}

/** Platform dependencies for installation discovery and CLI invocation. */
export interface ICopilotAppDependencies {
  readonly platform: NodeJS.Platform
  readonly homeDirectory: string
  readonly findMacApp: () => Promise<string>
  readonly findWindowsApps: () => Promise<ReadonlyArray<string>>
  readonly isExecutable: (path: string) => Promise<boolean>
  readonly run: (
    executable: string,
    args: ReadonlyArray<string>,
    timeout: number
  ) => Promise<{ readonly stdout: string; readonly stderr: string }>
}

/**
 * Execute without a shell and wait for CLI completion. The open command has its
 * own 20-second cold-start deadline, so callers allow it 30 seconds. Never retry:
 * a request may already have been queued even when its response is lost.
 */
export async function runCopilotAppCommand(
  executable: string,
  args: ReadonlyArray<string>,
  timeout: number
): Promise<{ readonly stdout: string; readonly stderr: string }> {
  return execFile(executable, args, {
    encoding: 'utf8',
    timeout,
    killSignal: 'SIGKILL',
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  })
}

function errorDetail(error: unknown): string {
  if (error instanceof Error) {
    if (
      'stderr' in error &&
      typeof error.stderr === 'string' &&
      error.stderr.trim()
    ) {
      return error.stderr.trim()
    }
    return error.message
  }
  return 'The command could not be completed.'
}

function isMissingExecutable(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

/** Create platform discovery and launch operations using the supplied OS services. */
export function createCopilotAppIntegration(deps: ICopilotAppDependencies) {
  const paths = deps.platform === 'win32' ? Path.win32 : Path.posix
  const supported = deps.platform === 'darwin' || deps.platform === 'win32'

  function getExecutable(path: string): string | null {
    if (!supported || !paths.isAbsolute(path) || path.includes('\0')) {
      return null
    }
    if (deps.platform === 'win32') {
      return path.toLowerCase().endsWith('.exe') ? path : null
    }
    const normalized = paths.normalize(path).replace(/\/$/, '')
    if (normalized.endsWith('.app')) {
      return paths.join(normalized, 'Contents', 'MacOS', 'github')
    }
    return normalized.endsWith('.app/Contents/MacOS/github') ? normalized : null
  }

  async function validateCopilotAppPath(path: string): Promise<boolean> {
    const executable = getExecutable(path)
    return (
      executable !== null &&
      (await deps.isExecutable(executable).catch(error => {
        log.warn('Could not validate the GitHub Copilot executable', error)
        return false
      }))
    )
  }

  async function findCopilotApp(): Promise<string | null> {
    const candidates = []
    if (deps.platform === 'darwin') {
      const found = await deps.findMacApp().catch(error => {
        log.debug(
          'Could not locate GitHub Copilot using Launch Services',
          error
        )
        return null
      })
      if (found) {
        candidates.push(found)
      }
      candidates.push(
        '/Applications/GitHub Copilot.app',
        paths.join(deps.homeDirectory, 'Applications', 'GitHub Copilot.app')
      )
    } else if (deps.platform === 'win32') {
      candidates.push(...(await deps.findWindowsApps()))
    }
    for (const candidate of candidates) {
      if (await validateCopilotAppPath(candidate)) {
        return candidate
      }
    }
    return null
  }

  async function openInCopilotApp(
    appPath: string,
    repositoryPath: string
  ): Promise<void> {
    const executable = getExecutable(appPath)
    if (executable === null || !(await validateCopilotAppPath(appPath))) {
      throw new CopilotAppError(
        'not-found',
        'GitHub Copilot could not be found.'
      )
    }
    if (!paths.isAbsolute(repositoryPath) || repositoryPath.includes('\0')) {
      throw new CopilotAppError(
        'launch-failed',
        'The repository path must be absolute.'
      )
    }

    // Older builds ignore CLI arguments, sometimes exiting successfully after
    // starting the GUI. Require an explicit capability response, not exit 0 alone.
    // Do this only on launch, never during passive discovery or path validation.
    // The probe itself may start the GUI on those older builds.
    let help: string
    try {
      help = (await deps.run(executable, ['--help'], 5000)).stdout
    } catch (error) {
      if (isMissingExecutable(error)) {
        throw new CopilotAppError(
          'not-found',
          'GitHub Copilot could not be found.'
        )
      }
      if (
        error instanceof Error &&
        'code' in error &&
        typeof error.code === 'string'
      ) {
        throw new CopilotAppError(
          'launch-failed',
          `Could not run GitHub Copilot. ${errorDetail(error)}`
        )
      }
      throw new CopilotAppError(
        'unsupported-version',
        `GitHub Copilot could not confirm support for opening repositories. Update the app and try again. ${errorDetail(
          error
        )}`
      )
    }
    if (
      !/^Usage:\s+github\b/m.test(help) ||
      !/^\s+open\s+/m.test(help) ||
      !help.includes('GitHub Copilot')
    ) {
      throw new CopilotAppError(
        'unsupported-version',
        'This version of GitHub Copilot does not support opening repositories. Update the app and try again.'
      )
    }

    try {
      await deps.run(executable, ['open', repositoryPath], 30000)
    } catch (error) {
      throw new CopilotAppError(
        isMissingExecutable(error) ? 'not-found' : 'launch-failed',
        `Could not open the repository in GitHub Copilot. ${errorDetail(error)}`
      )
    }
  }

  return { findCopilotApp, validateCopilotAppPath, openInCopilotApp }
}

const integration = createCopilotAppIntegration({
  platform: process.platform,
  homeDirectory: homedir(),
  findMacApp: () => appPath('com.github.githubapp'),
  findWindowsApps: findWindowsCopilotAppCandidates,
  isExecutable: async path => {
    try {
      if (!(await stat(path)).isFile()) {
        return false
      }
      await access(
        path,
        process.platform === 'win32' ? constants.F_OK : constants.X_OK
      )
      return true
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error.code === 'ENOENT' || error.code === 'ENOTDIR')
      ) {
        return false
      }
      throw error
    }
  },
  run: runCopilotAppCommand,
})

/** Discover a validated installation on demand, without launching the app. */
export const findCopilotApp = integration.findCopilotApp

/** Check the selected bundle or executable on disk, without launching it. */
export const validateCopilotAppPath = integration.validateCopilotAppPath

/** Hand off a repository and wait for acceptance/focus, not session creation. */
export const openInCopilotApp = integration.openInCopilotApp
