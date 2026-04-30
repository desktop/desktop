import { execFile } from 'child_process'
import { isWSLPath, getWSLDistroName, wslUNCToPosixPath } from '../is-wsl-path'
import { enableWSLPerformanceOptimizations } from '../feature-flag'

interface IWSLExecResult {
  readonly stdout: string | Buffer
  readonly stderr: string | Buffer
  readonly exitCode: number
}

interface IWSLExecOptions {
  readonly encoding?: BufferEncoding | 'buffer'
  readonly maxBuffer?: number
  readonly env?: Record<string, string | undefined>
  readonly signal?: AbortSignal
  readonly killSignal?: NodeJS.Signals | number
  readonly stdin?: string | Buffer
  readonly stdinEncoding?: BufferEncoding
  readonly timeout?: number
}

// Executes a git command inside WSL using `wsl.exe -d <distro> --cd <path> -e git ...`.
// Bypasses the 9P boundary by running git natively on the Linux filesystem.
// Only safe for read-only operations (status, log, diff, branch, etc.) that
// don't need the trampoline credential helper or hook interception.
export function wslGitExec(
  args: ReadonlyArray<string>,
  repositoryPath: string,
  options?: IWSLExecOptions
): Promise<IWSLExecResult> {
  const distro = getWSLDistroName(repositoryPath)
  if (!distro) {
    return Promise.reject(
      new Error(`wslGitExec called with non-WSL path: ${repositoryPath}`)
    )
  }

  const posixPath = wslUNCToPosixPath(repositoryPath)
  if (!posixPath) {
    return Promise.reject(
      new Error(`Failed to convert WSL path: ${repositoryPath}`)
    )
  }

  const wslArgs = [
    '-d', distro,
    '--cd', posixPath,
    '-e', 'git',
    ...args,
  ]

  const opts = {
    encoding: (options?.encoding ?? 'utf8') as BufferEncoding,
    maxBuffer: options?.maxBuffer ?? Infinity,
    signal: options?.signal,
    killSignal: options?.killSignal,
    // 2 minute timeout prevents infinite hangs when SSH prompts for input
    // in a non-interactive shell (e.g. passphrase, unknown host)
    timeout: options?.timeout ?? 120_000,
    env: {
      ...process.env,
      // Strip Windows-specific trampoline vars — they reference Windows
      // binaries/ports that won't work inside the Linux VM.
      DESKTOP_PORT: undefined,
      DESKTOP_TRAMPOLINE_TOKEN: undefined,
      GIT_ASKPASS: undefined,
      // Keep TERM=dumb to avoid pager issues
      TERM: 'dumb',
    },
  }

  return new Promise<IWSLExecResult>((resolve, reject) => {
    const cp = execFile('wsl.exe', wslArgs, opts, (err, stdout, stderr) => {
      if (!err || typeof err.code === 'number') {
        const exitCode = typeof err?.code === 'number' ? err.code : 0
        resolve({ stdout, stderr, exitCode })
        return
      }

      reject(
        new Error(
          `wsl.exe git failed: ${err.message}\nstderr: ${stderr}`
        )
      )
    })

    if (options?.stdin !== undefined && cp.stdin) {
      if (options.stdinEncoding) {
        cp.stdin.end(options.stdin, options.stdinEncoding)
      } else {
        cp.stdin.end(options.stdin)
      }
    }
  })
}

// Git subcommands safe to route through WSL-native git. These don't need
// the trampoline credential helper or Desktop-intercepted hooks.
// Only commit, push, pull, merge, clone, and credential MUST stay on the
// Windows trampoline path (they use interceptHooks or need credentials).
// fetch: safe because SSH auth uses WSL ~/.ssh/ keys (no trampoline needed),
// and HTTPS auth can use GCM or git credential store configured in WSL.
const WSL_SAFE_SUBCOMMANDS = new Set([
  'status',
  'log',
  'diff',
  'diff-index',
  'diff-tree',
  'branch',
  'for-each-ref',
  'rev-list',
  'rev-parse',
  'show',
  'show-ref',
  'tag',
  'stash',
  'config',
  'remote',
  'merge-base',
  'cat-file',
  'ls-tree',
  'name-rev',
  'check-attr',
  'var',
  'symbolic-ref',
  'reflog',
  'checkout',
  'switch',
  'reset',
  'submodule',
  'add',
  'update-index',
  'apply',
  'rm',
  'commit-tree',
  'update-ref',
  'cherry-pick',
  'rebase',
  'init',
  'hash-object',
  'write-tree',
  'read-tree',
  'fetch',
  'ls-remote',
])

export function isWSLSafeGitSubcommand(
  args: ReadonlyArray<string>
): boolean {
  // Find the actual git subcommand (skip flags like --no-optional-locks
  // and -c key=value pairs)
  let skipNext = false
  let subcommand: string | undefined
  for (const arg of args) {
    if (skipNext) {
      skipNext = false
      continue
    }
    if (arg === '-c' || arg === '-C') {
      skipNext = true
      continue
    }
    if (arg.startsWith('-')) {
      continue
    }
    subcommand = arg
    break
  }

  if (!subcommand) {
    return false
  }

  return WSL_SAFE_SUBCOMMANDS.has(subcommand)
}

export function canUseWSLGit(
  args: ReadonlyArray<string>,
  repositoryPath: string
): boolean {
  if (!__WIN32__) {
    return false
  }

  if (!enableWSLPerformanceOptimizations()) {
    return false
  }

  if (!isWSLPath(repositoryPath)) {
    return false
  }

  return isWSLSafeGitSubcommand(args)
}
