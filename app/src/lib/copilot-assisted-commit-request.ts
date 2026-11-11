import type { SessionConfig } from '@github/copilot-sdk'
import { IAssistedCommitAnalysis } from '../models/assisted-commit'
import {
  assertAssistedCommitAnalysis,
  buildAssistedCommitSystemPrompt,
  buildAssistedCommitUserPrompt,
  CopilotAssistedCommitError,
  CopilotAssistedCommitResponse,
  CopilotAssistedCommitResponseSchema,
  getAssistedCommitSessionConfig,
  ICopilotAssistedCommitPlanningOptions,
  parseCopilotAssistedCommitStructuredResponse,
} from './copilot-assisted-commit'
import {
  createCopilotInMemorySessionFsProvider,
  ICopilotInMemorySessionFsProvider,
} from './copilot-in-memory-session-fs-provider'
import {
  awaitCancellableCopilotOperation,
  ICopilotMessageSession,
  ICopilotPlanningClient,
  ICopilotPlanningSession,
  sendCopilotPlanningRequest,
} from './copilot-operation'
import {
  generateCommitMessagePromptTags,
  getCleanedEnforcedRuleDescriptions,
} from './copilot-prompt'

/** Default deadline covering setup, instruction loading, and the response. */
export const DefaultCopilotRequestTimeoutMs = 60000

/** Bound graceful teardown before force-stopping the owned planner runtime. */
export const AssistedCommitCleanupTimeoutMs = 1000

/** Host capabilities shared by the application and the headless evaluator. */
export interface IAssistedCommitRequestHost {
  readonly createClient: () => Promise<ICopilotPlanningClient>
  /** Evaluation hosts may bound built-in requests without changing model defaults. */
  readonly timeoutMs?: number
  readonly resolveModel: () => Pick<
    SessionConfig,
    'model' | 'reasoningEffort' | 'provider'
  >
}

async function disposeAssistedCommitClient(
  client: ICopilotPlanningClient,
  session: ICopilotMessageSession | null,
  interrupted: boolean
): Promise<void> {
  if (interrupted) {
    await client.forceStop()
    return
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('Copilot assisted commit cleanup timed out')),
      AssistedCommitCleanupTimeoutMs
    )
  })
  let forcing = false
  const cleanup = async () => {
    await session?.disconnect()
    if (forcing) {
      return
    }
    const errors = await client.stop()
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Copilot runtime cleanup failed')
    }
  }
  const pending = cleanup()
  try {
    await Promise.race([pending, timeout])
  } catch (error) {
    forcing = true
    clearTimeout(timer)
    try {
      await client.forceStop()
    } catch (forceStopError) {
      throw new AggregateError(
        [error, forceStopError],
        'Copilot runtime cleanup and force stop failed'
      )
    }
    const settled = pending.then(
      () => undefined,
      () => undefined
    )
    const joinTimeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              'Copilot graceful cleanup did not settle after force stop'
            )
          ),
        AssistedCommitCleanupTimeoutMs
      )
    })
    try {
      await Promise.race([settled, joinTimeout])
    } catch (joinError) {
      throw new AggregateError(
        [error, joinError],
        'Copilot runtime stopped, but graceful cleanup is still pending'
      )
    }
    log.warn(
      'Copilot assisted commit graceful cleanup required a completed force stop'
    )
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Run the production planner with host-owned credentials and model selection.
 *
 * This owns the deadline, prompts, response validation, and runtime cleanup.
 * The application and evaluator differ only in their injected host capabilities.
 */
export async function runAssistedCommitPlanningRequest(
  analysis: IAssistedCommitAnalysis,
  repositoryPath: string,
  options: ICopilotAssistedCommitPlanningOptions,
  host: IAssistedCommitRequestHost
): Promise<CopilotAssistedCommitResponse> {
  assertAssistedCommitAnalysis(analysis)
  const request = options.request
  const timeoutMs =
    host.timeoutMs ??
    (request?.kind === 'byok' && request.timeoutMs !== undefined
      ? request.timeoutMs
      : DefaultCopilotRequestTimeoutMs)
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647) {
    throw new CopilotAssistedCommitError(
      'invalid-request',
      'The assisted commit request timeout must be finite, positive and supported by the runtime'
    )
  }
  const deadline = new AbortController()
  const signal =
    options.signal === undefined
      ? deadline.signal
      : AbortSignal.any([options.signal, deadline.signal])
  const cancellationError = () =>
    options.signal?.aborted
      ? new CopilotAssistedCommitError(
          'cancelled',
          'Assisted commit planning cancelled'
        )
      : new CopilotAssistedCommitError(
          'timed-out',
          'Assisted commit planning timed out'
        )
  const throwIfCancelled = () => {
    if (signal.aborted) {
      throw cancellationError()
    }
  }
  const timer = setTimeout(() => deadline.abort(), timeoutMs)
  let client: ICopilotPlanningClient | null = null
  let session: ICopilotPlanningSession | null = null
  let failed = false
  let failure: unknown
  let disposed = false
  const fileSystems: ICopilotInMemorySessionFsProvider[] = []
  try {
    throwIfCancelled()
    const tags = generateCommitMessagePromptTags()
    const mode = options.mode ?? 'plan'
    const cleanedRules = getCleanedEnforcedRuleDescriptions(
      options.commitMessageRules
    )
    const prompt = buildAssistedCommitUserPrompt(analysis, tags, cleanedRules)
    const model = host.resolveModel()
    throwIfCancelled()
    client = await awaitCancellableCopilotOperation(host.createClient, {
      signal,
      cancellationError,
      disposeLateValue: lateClient => lateClient.forceStop(),
    })
    throwIfCancelled()
    const planningClient = client
    session = await awaitCancellableCopilotOperation(
      () =>
        planningClient.createSession({
          ...getAssistedCommitSessionConfig(
            repositoryPath,
            buildAssistedCommitSystemPrompt(tags, mode)
          ),
          clientName: 'github/desktop:assisted-commit',
          ...model,
          createSessionFsProvider: () => {
            const fs = createCopilotInMemorySessionFsProvider()
            if (disposed) {
              fs.dispose()
            } else {
              fileSystems.push(fs)
            }
            return fs
          },
        }),
      {
        signal,
        cancellationError,
        disposeLateValue: lateSession => lateSession.disconnect(),
      }
    )
    throwIfCancelled()
    const response = await sendCopilotPlanningRequest(
      session,
      { prompt, responseSchema: CopilotAssistedCommitResponseSchema },
      signal,
      cancellationError
    )
    throwIfCancelled()
    return parseCopilotAssistedCommitStructuredResponse(
      analysis,
      response?.data.content,
      mode
    )
  } catch (error) {
    failed = true
    failure = signal.aborted ? cancellationError() : error
    throw failure
  } finally {
    clearTimeout(timer)
    const cleanupErrors: unknown[] = []
    try {
      if (client !== null) {
        await disposeAssistedCommitClient(client, session, signal.aborted)
      }
    } catch (error) {
      cleanupErrors.push(error)
    } finally {
      disposed = true
      fileSystems.forEach(fs => fs.dispose())
    }
    if (cleanupErrors.length > 0) {
      throw new CopilotAssistedCommitError(
        'cleanup-failed',
        'Copilot assisted commit resources could not be cleaned up',
        {
          cause: failed
            ? failure
            : signal.aborted
            ? cancellationError()
            : undefined,
          cleanupErrors,
        }
      )
    }
    if (!failed) {
      throwIfCancelled()
    }
  }
}
