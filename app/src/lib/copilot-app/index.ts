import { isAbsolute } from 'path'
import { execFile } from '../exec-file'
import { pathExists } from '../path-exists'
import * as Darwin from './darwin'
import * as Win32 from './win32'

export const copilotAppMarketingUrl =
  'https://gh.io/app?utm_source=github_desktop_app'

type CopilotAppErrorKind = 'not-found' | 'launch-failed'

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
  readonly findAppCandidates: () => Promise<ReadonlyArray<string>>
  readonly getExecutable: (path: string) => string | null
  readonly isAbsolutePath: (path: string) => boolean
  readonly pathExists: (path: string) => Promise<boolean>
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
  async function validateCopilotAppPath(path: string): Promise<boolean> {
    const executable = deps.getExecutable(path)
    return executable !== null && (await deps.pathExists(executable))
  }

  async function findCopilotApp(): Promise<string | null> {
    for (const candidate of await deps.findAppCandidates()) {
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
    const executable = deps.getExecutable(appPath)
    if (executable === null || !(await deps.pathExists(executable))) {
      throw new CopilotAppError(
        'not-found',
        'GitHub Copilot could not be found.'
      )
    }
    if (!deps.isAbsolutePath(repositoryPath) || repositoryPath.includes('\0')) {
      throw new CopilotAppError(
        'launch-failed',
        'The repository path must be absolute.'
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

async function findCopilotAppCandidates(): Promise<ReadonlyArray<string>> {
  if (__DARWIN__) {
    return Darwin.findCopilotAppCandidates()
  }
  if (__WIN32__) {
    return Win32.findCopilotAppCandidates()
  }
  return []
}

function getCopilotAppExecutable(path: string): string | null {
  if (__DARWIN__) {
    return Darwin.getCopilotAppExecutable(path)
  }
  if (__WIN32__) {
    return Win32.getCopilotAppExecutable(path)
  }
  return null
}

const integration = createCopilotAppIntegration({
  findAppCandidates: findCopilotAppCandidates,
  getExecutable: getCopilotAppExecutable,
  isAbsolutePath: isAbsolute,
  pathExists,
  run: runCopilotAppCommand,
})

/** Discover a validated installation on demand, without launching the app. */
export const findCopilotApp = integration.findCopilotApp

/** Check the selected bundle or executable on disk, without launching it. */
export const validateCopilotAppPath = integration.validateCopilotAppPath

/** Hand off a repository and wait for acceptance/focus, not session creation. */
export const openInCopilotApp = integration.openInCopilotApp
