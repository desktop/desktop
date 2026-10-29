import { Repository } from '../../models/repository'
import {
  prepareAssistedCommitPushOwner,
  verifyAssistedCommitPushOwner,
} from '../git/assisted-commit-push'
import { withRepositoryGitSpawnFence } from '../git/repository-operation'
import { IAssistedCommitRun } from './types'
/** Fence the original accepted repository before native access and publication. */
export function verifyAcceptedOwner(run: IAssistedCommitRun | undefined): void {
  if (run?.finalized && run.pushDestination?.kind === 'configured') {
    verifyAssistedCommitPushOwner(run.pushDestination)
  }
}
/** Fence the original accepted repository before native access and publication. */
export function withAcceptedSpawnFence<T>(
  run: IAssistedCommitRun | undefined,
  operation: () => T
): T {
  return run?.finalized && run.pushDestination?.kind === 'configured'
    ? withRepositoryGitSpawnFence(() => verifyAcceptedOwner(run), operation)
    : operation()
}
/** Fence the original accepted repository before native access and publication. */
export async function withAcceptedAliasFence<T>(
  run: IAssistedCommitRun,
  repositories: ReadonlyArray<Repository>,
  operation: () => Promise<T>
): Promise<T> {
  if (!run.finalized || run.pushDestination?.kind !== 'configured') {
    return operation()
  }
  const destination = run.pushDestination
  const aliases = await Promise.all(
    repositories.map(repository =>
      prepareAssistedCommitPushOwner(repository, destination)
    )
  )
  const verify = () => {
    verifyAcceptedOwner(run)
    for (const alias of aliases) {
      alias()
    }
  }
  const result = await withRepositoryGitSpawnFence(verify, operation)
  verify()
  return result
}
