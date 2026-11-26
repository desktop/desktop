import { assistedCommitErrorCauses } from '../assisted-commit-run'
import { CopilotAssistedCommitError } from '../copilot-assisted-commit'
import { AssistedCommitError } from '../git/assisted-commit/error'
import { AssistedCommitRecoveryEvent } from '../git/assisted-commit/progress'
import { IDailyMeasures } from '../stats/stats-database'

/** Bounded daily counts, without repository, model or error metadata. */
export type AssistedCommitMeasure = Extract<
  keyof IDailyMeasures,
  | `copilotAssistedCommit${string}`
  | `commitMode${string}`
  | 'manualCommitWorkflowCount'
>

/** The existing daily stats owner supplies persistence. */
export type AssistedCommitMetricRecorder = (
  measure: AssistedCommitMeasure,
  count?: number
) => Promise<void>

/** Usage failures must never change commit, cancellation or recovery behavior. */
export async function recordAssistedCommitMetric(
  record: AssistedCommitMetricRecorder | undefined,
  measure: AssistedCommitMeasure,
  count = 1
): Promise<void> {
  try {
    await record?.(measure, count)
  } catch (error) {
    log.error('Could not record assisted commit usage statistics', error)
  }
}

/** One run's count guards and monotonic processing clock survive recovery retries. */
export function createAssistedCommitMetrics(
  nonEmpty: boolean,
  record?: AssistedCommitMetricRecorder
) {
  const recorded = new Set<AssistedCommitMeasure>()
  const pending: Promise<void>[] = []
  const started = performance.now()
  let waitingSince: number | undefined
  let waited = 0

  const emit = (measure: AssistedCommitMeasure, count = 1) => {
    pending.push(recordAssistedCommitMetric(record, measure, count))
  }
  const once = (measure: AssistedCommitMeasure, count = 1) => {
    if (nonEmpty && !recorded.has(measure)) {
      recorded.add(measure)
      emit(measure, count)
    }
  }
  const diagnose = (error: unknown) => {
    const causes = new Set(assistedCommitErrorCauses(error))
    for (const cause of causes) {
      if (cause instanceof AssistedCommitError) {
        for (const recoveryError of cause.recovery?.errors ?? []) {
          for (const nestedCause of assistedCommitErrorCauses(recoveryError)) {
            causes.add(nestedCause)
          }
        }
        if (
          cause.code === 'selection-changed' &&
          cause.diagnostic !== 'repository-changed'
        ) {
          once('copilotAssistedCommitSelectionChangedCount')
        } else if (
          cause.code === 'repository-changed' ||
          cause.code === 'index-changed' ||
          cause.diagnostic === 'repository-changed'
        ) {
          once('copilotAssistedCommitRepositoryChangedCount')
        } else if (
          cause.code === 'invalid-plan' ||
          cause.diagnostic === 'plan-rejected'
        ) {
          once('copilotAssistedCommitPlanRejectedCount')
        }
        if (cause.diagnostic === 'commit-verification-failed') {
          once('copilotAssistedCommitCommitVerificationFailedCount')
        }
      } else if (
        cause instanceof CopilotAssistedCommitError &&
        cause.invalidCoverage
      ) {
        once('copilotAssistedCommitPlanRejectedCount')
      }
    }
  }
  return {
    once,
    diagnose,
    wait: () => {
      waitingSince ??= performance.now()
    },
    resume: () => {
      if (waitingSince !== undefined) {
        waited += performance.now() - waitingSince
        waitingSince = undefined
      }
    },
    accepted: (commits: number) => {
      if (!nonEmpty) {
        if (!recorded.has('copilotAssistedCommitEmptyCommitCount')) {
          recorded.add('copilotAssistedCommitEmptyCommitCount')
          emit('copilotAssistedCommitEmptyCommitCount')
        }
        return
      }
      if (recorded.has('copilotAssistedCommitAcceptedCount')) {
        return
      }
      once('copilotAssistedCommitAcceptedCount')
      once('copilotAssistedCommitCreatedCommitCount', commits)
      if (commits > 1) {
        once('copilotAssistedCommitMultiCommitRunCount')
      }
      const duration = performance.now() - started - waited
      if (duration > 15000) {
        once('copilotAssistedCommitOver15sCount')
      }
      if (duration > 30000) {
        once('copilotAssistedCommitOver30sCount')
      }
      if (duration > 60000) {
        once('copilotAssistedCommitOver60sCount')
      }
      if (duration > 120000) {
        once('copilotAssistedCommitOver120sCount')
      }
    },
    recovery: (event: AssistedCommitRecoveryEvent) => {
      if (nonEmpty) {
        emit(
          event === 'started'
            ? 'copilotAssistedCommitRecoveryAttemptCount'
            : event === 'succeeded'
            ? 'copilotAssistedCommitRecoverySuccessCount'
            : 'copilotAssistedCommitRecoveryErrorCount'
        )
      }
    },
    flush: async () => {
      await Promise.all(pending)
      pending.length = 0
    },
  }
}

/** Kept on the existing run owner, not reconstructed from UI state. */
export type AssistedCommitMetrics = ReturnType<
  typeof createAssistedCommitMetrics
>
