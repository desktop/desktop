import { ChildProcess, spawn } from 'child_process'
import { GitError as DugiteError, parseError } from 'dugite'

import {
  GitError,
  getDescriptionForError,
  IGitStringExecutionOptions,
  IGitStringResult,
} from './core'
import { pushTerminalChunk } from './push-terminal-chunk'

function systemGitEnvironment(
  env: NodeJS.ProcessEnv | undefined
): NodeJS.ProcessEnv {
  const systemEnv: NodeJS.ProcessEnv = {
    ...process.env,
    TERM: 'dumb',
    GIT_TERMINAL_PROMPT: '0',
    ...env,
  }

  delete systemEnv.DESKTOP_PORT
  delete systemEnv.DESKTOP_TRAMPOLINE_IDENTIFIER
  delete systemEnv.DESKTOP_TRAMPOLINE_TOKEN
  delete systemEnv.GIT_ASKPASS
  delete systemEnv.SSH_ASKPASS

  if (systemEnv.GIT_CONFIG_PARAMETERS?.includes('credential.helper=desktop')) {
    delete systemEnv.GIT_CONFIG_PARAMETERS
  }

  return systemEnv
}

function callTerminalOutputSubscribers(
  options: IGitStringExecutionOptions | undefined,
  process: ChildProcess,
  terminalChunks: string[]
) {
  options?.onTerminalOutputAvailable?.(cb => {
    terminalChunks.forEach(chunk => cb(chunk))

    process.stdout?.on('data', cb)
    process.stderr?.on('data', cb)

    return {
      unsubscribe: () => {
        process.stdout?.off('data', cb)
        process.stderr?.off('data', cb)
      },
    }
  })
}

export function systemGit(
  args: string[],
  path: string,
  name: string,
  options?: IGitStringExecutionOptions
): Promise<IGitStringResult> {
  const successExitCodes = options?.successExitCodes ?? new Set([0])
  const expectedErrors = options?.expectedErrors ?? new Set<DugiteError>()

  return new Promise((resolve, reject) => {
    const process = spawn('git', args, {
      cwd: path,
      env: systemGitEnvironment(options?.env),
      windowsHide: true,
    })

    const terminalChunks: string[] = []
    const terminalCapacity = 256 * 1024
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []

    const capture = (chunks: Buffer[]) => (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      chunks.push(buffer)
      pushTerminalChunk(terminalChunks, terminalCapacity, chunk)
    }

    process.stdout?.on('data', capture(stdoutChunks))
    process.stderr?.on('data', capture(stderrChunks))
    callTerminalOutputSubscribers(options, process, terminalChunks)
    options?.processCallback?.(process)

    process.on('error', error => {
      reject(new Error(`Failed to execute system git for ${name}: ${error}`))
    })

    process.on('close', exitCode => {
      const normalizedExitCode = exitCode ?? 1
      const stdout = Buffer.concat(stdoutChunks).toString()
      const stderr = Buffer.concat(stderrChunks).toString()
      const acceptableExitCode = successExitCodes.has(normalizedExitCode)

      let gitError: DugiteError | null = null
      if (!acceptableExitCode) {
        gitError = parseError(stderr) ?? parseError(stdout)
      }

      const gitErrorDescription =
        gitError !== null ? getDescriptionForError(gitError, stderr) : null

      const result: IGitStringResult = {
        exitCode: normalizedExitCode,
        stdout,
        stderr,
        gitError,
        gitErrorDescription,
        path,
      }

      if (
        acceptableExitCode ||
        (gitError !== null && expectedErrors.has(gitError))
      ) {
        resolve(result)
        return
      }

      const terminalOutput = terminalChunks.join('')
      const errorMessage = [
        `System \`git ${args.join(
          ' '
        )}\` exited with an unexpected code: ${normalizedExitCode}.`,
      ]

      if (terminalOutput.length > 0) {
        errorMessage.push(terminalOutput.slice(-1024))
      }

      if (gitError !== null) {
        errorMessage.push(
          `(The error was parsed as ${gitError}: ${gitErrorDescription})`
        )
      }

      log.error(errorMessage.join('\n'))

      reject(new GitError(result, args, terminalOutput))
    })
  })
}
