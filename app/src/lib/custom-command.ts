import { execFile, spawn } from 'child_process'
import { createHash, randomUUID } from 'crypto'
import * as Path from 'path'

/** Whether a command list belongs to a checkout or is shared by all repositories. */
export type CustomCommandScope = 'repository' | 'global'

/** A user-authored command saved locally on this computer. */
export interface ICustomCommand {
  readonly id: string
  readonly name: string
  readonly command: string
}

/** The outcome of an embedded command, after its output streams have closed. */
export type CustomCommandResult =
  | { readonly kind: 'exited'; readonly exitCode: number }
  | { readonly kind: 'cancelled' }

/** A running command owned by the execution dialog. */
export interface ICustomCommandExecution {
  /** Resolves on exit; rejects if the process could not start or was lost. */
  readonly result: Promise<CustomCommandResult>
  /** Stop this process and its children without affecting other terminals. */
  readonly stop: () => Promise<void>
}

function commandDurationKey(repositoryPath: string, command: ICustomCommand) {
  const key = createHash('sha256')
    .update(JSON.stringify([repositoryPath, command.id]))
    .digest('hex')
  return `custom-command-duration:${key}`
}

function commandHash(command: ICustomCommand) {
  return createHash('sha256').update(command.command).digest('hex')
}

/** Read the last successful duration for this command version and checkout. */
export function getCustomCommandDuration(
  storage: Pick<Storage, 'getItem'>,
  repositoryPath: string,
  command: ICustomCommand
): number | null {
  const saved = storage.getItem(commandDurationKey(repositoryPath, command))
  if (saved === null) {
    return null
  }
  const parsed: unknown = JSON.parse(saved)
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('commandHash' in parsed) ||
    typeof parsed.commandHash !== 'string' ||
    !('durationMs' in parsed) ||
    typeof parsed.durationMs !== 'number' ||
    !Number.isFinite(parsed.durationMs) ||
    parsed.durationMs <= 0
  ) {
    throw new Error('The saved custom command duration is invalid.')
  }
  return parsed.commandHash === commandHash(command) ? parsed.durationMs : null
}

/** Remember a successful run without storing its command text or output. */
export function saveCustomCommandDuration(
  storage: Pick<Storage, 'setItem'>,
  repositoryPath: string,
  command: ICustomCommand,
  durationMs: number
): void {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error('The custom command duration must be a positive number.')
  }
  storage.setItem(
    commandDurationKey(repositoryPath, command),
    JSON.stringify({ commandHash: commandHash(command), durationMs })
  )
}

/** Time-based estimate only; completion is determined by the process result. */
export function getCustomCommandProgress(
  elapsedMs: number,
  expectedDurationMs: number | null
): number | undefined {
  return expectedDurationMs === null
    ? undefined
    : Math.min(
        95,
        Math.max(0, Math.floor((elapsedMs / expectedDurationMs) * 100))
      )
}

function isCustomCommand(value: unknown): value is ICustomCommand {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    'name' in value &&
    typeof value.name === 'string' &&
    'command' in value &&
    typeof value.command === 'string'
  )
}

/** Return a validation message for incomplete or ambiguous command lists. */
export function getCustomCommandsValidationError(
  commands: ReadonlyArray<ICustomCommand>
): string | null {
  if (
    commands.some(
      c => c.name.trim().length === 0 || c.command.trim().length === 0
    )
  ) {
    return 'Each command needs a name and a PowerShell command.'
  }
  if (
    new Set(commands.map(c => c.name.trim().toLowerCase())).size !==
    commands.length
  ) {
    return 'Give each command a different name.'
  }
  if (new Set(commands.map(c => c.id)).size !== commands.length) {
    return 'Command identifiers must be unique.'
  }
  return null
}

/** Read locally configured commands, never executable instructions from repository files. */
export function getCustomCommands(
  storage: Pick<Storage, 'getItem'>,
  repositoryPath: string,
  scope: CustomCommandScope = 'repository'
): ReadonlyArray<ICustomCommand> {
  const saved = storage.getItem(
    scope === 'global'
      ? 'global-custom-commands'
      : `custom-commands:${repositoryPath}`
  )
  if (saved === null) {
    if (scope === 'global') {
      return []
    }
    const legacyCommand = storage.getItem(`custom-command:${repositoryPath}`)
    return legacyCommand?.trim()
      ? [
          {
            id: 'legacy-command',
            name: 'Custom command',
            command: legacyCommand,
          },
        ]
      : []
  }

  const parsed: unknown = JSON.parse(saved)
  if (!Array.isArray(parsed) || !parsed.every(isCustomCommand)) {
    throw new Error('The saved custom command list is invalid.')
  }
  const error = getCustomCommandsValidationError(parsed)
  if (error !== null) {
    throw new Error(error)
  }
  return parsed
}

/** Save the entire validated list, including an empty list to forget all commands. */
export function saveCustomCommands(
  storage: Pick<Storage, 'setItem' | 'removeItem'>,
  repositoryPath: string,
  commands: ReadonlyArray<ICustomCommand>,
  scope: CustomCommandScope = 'repository'
) {
  const error = getCustomCommandsValidationError(commands)
  if (error !== null) {
    throw new Error(error)
  }
  storage.setItem(
    scope === 'global'
      ? 'global-custom-commands'
      : `custom-commands:${repositoryPath}`,
    JSON.stringify(commands)
  )
  if (scope === 'repository') {
    storage.removeItem(`custom-command:${repositoryPath}`)
  }
}

/** Export portable command text, without checkout paths, identifiers or history. */
export function serializeCustomCommands(
  commands: ReadonlyArray<ICustomCommand>
): string {
  const error = getCustomCommandsValidationError(commands)
  if (error !== null || commands.length === 0) {
    throw new Error(error ?? 'Choose at least one command to export.')
  }
  return (
    JSON.stringify(
      {
        format: 'github-desktop-custom-commands',
        version: 1,
        commands: commands.map(({ name, command }) => ({ name, command })),
      },
      null,
      2
    ) + '\n'
  )
}

function isSharedCommand(
  value: unknown
): value is Pick<ICustomCommand, 'name' | 'command'> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    'command' in value &&
    typeof value.command === 'string' &&
    value.command.trim().length > 0
  )
}

/** Append imported commands to a draft, assigning fresh identities and unique names. */
export function importCustomCommandsFromJSON(
  contents: string,
  existing: ReadonlyArray<ICustomCommand>
): ReadonlyArray<ICustomCommand> {
  const parsed: unknown = JSON.parse(contents.replace(/^\uFEFF/, ''))
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('format' in parsed) ||
    parsed.format !== 'github-desktop-custom-commands' ||
    !('version' in parsed) ||
    parsed.version !== 1 ||
    !('commands' in parsed) ||
    !Array.isArray(parsed.commands) ||
    parsed.commands.length === 0 ||
    !parsed.commands.every(isSharedCommand)
  ) {
    throw new Error(
      'Choose a version 1 Custom commands JSON export containing nonempty command names and scripts.'
    )
  }

  const usedNames = new Set(existing.map(c => c.name.trim().toLowerCase()))
  const imported = parsed.commands.map(entry => {
    let name = entry.name
    let suffix = 2
    while (usedNames.has(name.trim().toLowerCase())) {
      name = `${entry.name.trim()} (${suffix++})`
    }
    usedNames.add(name.trim().toLowerCase())
    return { id: randomUUID(), name, command: entry.command }
  })
  return [...existing, ...imported]
}

/** Encode user-authored PowerShell without interpolating paths or shell arguments. */
export function getCustomCommandArguments(
  command: string
): ReadonlyArray<string> {
  if (command.trim().length === 0) {
    throw new Error('Enter a command to run.')
  }

  return [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-OutputFormat',
    'Text',
    '-EncodedCommand',
    Buffer.from(
      [
        '$ErrorActionPreference = "Stop"',
        '$ProgressPreference = "SilentlyContinue"',
        '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)',
        '$OutputEncoding = [Console]::OutputEncoding',
        '$global:LASTEXITCODE = 0',
        command,
        'if (-not $? -and $LASTEXITCODE -eq 0) { exit 1 }',
        'exit $LASTEXITCODE',
      ].join('\n'),
      'utf16le'
    ).toString('base64'),
  ]
}

/** Run hidden PowerShell with streamed output for the application's execution UI. */
export function startCustomCommand(
  repositoryPath: string,
  command: string,
  onOutput: (chunk: Buffer) => void
): ICustomCommandExecution {
  if (!__WIN32__) {
    throw new Error('Custom commands are currently supported on Windows only.')
  }

  const args = getCustomCommandArguments(command)
  const systemDirectory = Path.join(
    process.env.SystemRoot || 'C:\\Windows',
    'System32'
  )
  const executable = Path.join(
    systemDirectory,
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe'
  )

  const child = spawn(executable, args, {
    cwd: repositoryPath,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    shell: false,
  })
  child.stdout.on('data', onOutput)
  child.stderr.on('data', onOutput)

  let closed = false
  let cancelled = false
  let stopRequest: Promise<void> | null = null
  const result = new Promise<CustomCommandResult>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => {
      closed = true
      const finish = () => {
        if (cancelled) {
          resolve({ kind: 'cancelled' })
        } else if (code !== null) {
          resolve({ kind: 'exited', exitCode: code })
        } else {
          reject(
            new Error(
              `The command ended unexpectedly (${signal ?? 'unknown signal'}).`
            )
          )
        }
      }
      // taskkill may close PowerShell before reporting that the tree was killed.
      if (stopRequest !== null) {
        stopRequest.then(finish, finish)
      } else {
        finish()
      }
    })
  })

  const stop = (): Promise<void> => {
    if (closed) {
      return Promise.resolve()
    }
    if (stopRequest !== null) {
      return stopRequest
    }
    const pid = child.pid
    if (pid === undefined) {
      return Promise.reject(new Error('The command process has not started.'))
    }
    stopRequest = new Promise<void>((resolve, reject) => {
      execFile(
        Path.join(systemDirectory, 'taskkill.exe'),
        ['/PID', String(pid), '/T', '/F'],
        { windowsHide: true },
        error => {
          if (error !== null && !closed) {
            reject(
              new Error(
                'Could not stop the command process tree. Try Stop command again.'
              )
            )
          } else {
            cancelled = error === null
            resolve()
          }
        }
      )
    }).catch(error => {
      stopRequest = null
      throw error
    })
    return stopRequest
  }

  return { result, stop }
}
