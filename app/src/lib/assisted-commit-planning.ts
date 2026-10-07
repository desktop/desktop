import {
  IAssistedCommitAnalysis,
  IAssistedCommitSnapshot,
  IValidatedAssistedCommitPlan,
} from '../models/assisted-commit'
import {
  AssistedCommitError,
  checkAssistedCommitCancellation,
  createSingleAssistedCommitPlan,
  IAssistedCommitOperationOptions,
  validateAssistedCommitPlan,
} from './git/assisted-commit'
import {
  assertAssistedCommitAnalysis,
  AssistedCommitPlanningMode,
  CopilotAssistedCommitError,
  CopilotAssistedCommitResponse,
  validateCopilotAssistedCommitResponse,
} from './copilot-assisted-commit'

/** Backend-independent, snapshot-analysis-only proposal callback. */
export type AssistedCommitPlanner = (
  analysis: IAssistedCommitAnalysis,
  mode: AssistedCommitPlanningMode,
  signal?: AbortSignal
) => Promise<CopilotAssistedCommitResponse>

/** Model analysis progress, never a claim of committed history. */
export interface IAssistedCommitPlanningProgress {
  readonly kind: 'planning' | 'summarizing-selection'
  readonly changes: number
}

/** Borrowed snapshot cancellation and awaited analysis/validation observers. */
export interface IAssistedCommitPlanningOptions
  extends IAssistedCommitOperationOptions {
  readonly onPlanningProgress?: (
    progress: IAssistedCommitPlanningProgress
  ) => void | Promise<void>
}

/**
 * Propose and validate the entire plan without staging or committing.
 *
 * The caller owns the snapshot scope. Only an unsafe-plan from cumulative-tree
 * validation of a valid split permits one fresh whole-selection request.
 * Invalid output, unsafe outcomes and transport/ownership errors never retry.
 */
export async function planAssistedCommits(
  snapshot: IAssistedCommitSnapshot,
  propose: AssistedCommitPlanner,
  options: IAssistedCommitPlanningOptions = {}
): Promise<IValidatedAssistedCommitPlan> {
  checkAssistedCommitCancellation(options.signal)
  assertAssistedCommitAnalysis(snapshot.analysis)

  const analyze = async (mode: AssistedCommitPlanningMode) => {
    checkAssistedCommitCancellation(options.signal)
    await options.onPlanningProgress?.({
      kind: mode === 'plan' ? 'planning' : 'summarizing-selection',
      changes: snapshot.analysis.changes.length,
    })
    checkAssistedCommitCancellation(options.signal)
    const response = await propose(snapshot.analysis, mode, options.signal)
    checkAssistedCommitCancellation(options.signal)
    const checked = validateCopilotAssistedCommitResponse(
      snapshot.analysis,
      response,
      mode
    )
    if (checked.kind === 'unsafe') {
      throw new CopilotAssistedCommitError('unsafe', checked.reason)
    }
    return checked
  }

  const response = await analyze('plan')
  const proposal =
    response.kind === 'uncertain-boundaries'
      ? createSingleAssistedCommitPlan(snapshot, {
          reason: 'uncertain-boundaries',
          title: response.title,
          description: response.description,
        })
      : { snapshotId: response.snapshotId, commits: response.commits }

  let observerFailed = false
  const validationOptions: IAssistedCommitOperationOptions = {
    signal: options.signal,
    onProgress: async progress => {
      try {
        await options.onProgress?.(progress)
      } catch (error) {
        observerFailed = true
        throw error
      }
    },
  }
  try {
    return await validateAssistedCommitPlan(
      snapshot,
      proposal,
      validationOptions
    )
  } catch (error) {
    if (
      observerFailed ||
      !(error instanceof AssistedCommitError) ||
      error.code !== 'unsafe-plan' ||
      proposal.commits.length <= 1
    ) {
      throw error
    }
  }

  const whole = await analyze('single-commit')
  const message =
    whole.kind === 'uncertain-boundaries' ? whole : whole.commits[0]
  const single = createSingleAssistedCommitPlan(snapshot, {
    reason: 'unsafe-split',
    title: message.title,
    description: message.description,
  })
  return validateAssistedCommitPlan(snapshot, single, validationOptions)
}
