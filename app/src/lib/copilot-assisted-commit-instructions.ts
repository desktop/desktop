import { lstat, mkdir, mkdtemp, rm, rmdir, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, isAbsolute, join, relative, sep } from 'path'
import { CopilotAssistedCommitError } from './copilot-assisted-commit'
import { ICopilotGlobalInstructions } from './copilot-operation'

/** An owned instruction-only config directory, never a repository worktree. */
export interface IAssistedCommitInstructionScope {
  readonly directory: string
  dispose(): Promise<void>
}

/**
 * Isolate executable Copilot config while preserving SDK-discovered user instructions.
 *
 * Empty tools/config discovery alone do not prevent SDK 1.0.13 from spawning
 * user MCP servers. Only approved instruction files are copied into this private
 * config directory. The SDK still loads repository instructions from its cwd.
 */
export async function createAssistedCommitInstructionScope(
  context: ICopilotGlobalInstructions,
  options: {
    readonly signal?: AbortSignal
    readonly cancellationError: () => Error
  }
): Promise<IAssistedCommitInstructionScope> {
  const checkCancelled = () => {
    if (options.signal?.aborted) {
      throw options.cancellationError()
    }
  }
  checkCancelled()
  const directory = await mkdtemp(
    join(tmpdir(), 'desktop-copilot-instructions-')
  )
  const identity = await lstat(directory).catch(async error => {
    try {
      // No content has been copied yet; never recursively remove unverified ownership.
      await rmdir(directory)
    } catch (cleanupError) {
      throw new CopilotAssistedCommitError(
        'cleanup-failed',
        'Copilot instruction directory ownership and cleanup failed',
        { cause: error, cleanupErrors: [cleanupError] }
      )
    }
    throw error
  })
  let disposed = false
  const dispose = async () => {
    if (disposed) {
      return
    }
    let observed
    try {
      observed = await lstat(directory)
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        disposed = true
        return
      }
      throw error
    }
    if (
      !observed.isDirectory() ||
      observed.dev !== identity.dev ||
      observed.ino !== identity.ino
    ) {
      throw new Error(
        `The owned Copilot instruction directory was replaced: ${directory}`
      )
    }
    await rm(directory, { recursive: true })
    disposed = true
  }
  try {
    checkCancelled()
    for (const source of context.sources) {
      if (source.location !== 'user') {
        throw new CopilotAssistedCommitError(
          'invalid-request',
          'Only SDK-discovered global instructions can be copied'
        )
      }
      const path = isAbsolute(source.sourcePath)
        ? relative(context.directory, source.sourcePath)
        : source.sourcePath
      const normalized = path.split(sep).join('/')
      if (
        normalized !== 'copilot-instructions.md' &&
        !(
          normalized.startsWith('instructions/') &&
          normalized.endsWith('.md') &&
          !normalized
            .split('/')
            .some(component => component === '..' || component === '.')
        )
      ) {
        throw new CopilotAssistedCommitError(
          'invalid-request',
          'The SDK returned an unsupported global instruction source'
        )
      }
      const target = join(directory, path)
      await mkdir(dirname(target), { recursive: true })
      checkCancelled()
      await writeFile(target, source.content, { mode: 0o600 })
      checkCancelled()
    }
    return { directory, dispose }
  } catch (error) {
    try {
      await dispose()
    } catch (cleanupError) {
      throw new CopilotAssistedCommitError(
        'cleanup-failed',
        'Copilot global instruction setup and cleanup failed',
        { cause: error, cleanupErrors: [cleanupError] }
      )
    }
    throw error
  }
}
