import { Account, isSameAccount } from '../models/account'
import { Branch, BranchType } from '../models/branch'
import { IAssistedCommitHead } from '../models/assisted-commit'
import { Repository, getRepositoryAccountIdentity } from '../models/repository'
import { AccountsStore } from './stores/accounts-store'
import { getAccountForRepository } from './get-account-for-repository'
import { getCommit } from './git/log'
import { getStatus } from './git/status'
import { readAssistedCommitHead } from './git/assisted-commit'
import {
  AssistedCommitPushDestination,
  IAssistedCommitPublicationResources,
  cleanupAssistedCommitPublication,
  completeAssistedCommitPushPublication,
  prepareAssistedCommitPushDestination,
  readAssistedCommitPushDestination,
  verifyAssistedCommitPushOwner,
} from './git/assisted-commit-push'
import { IAssistedCommitRepository } from './assisted-commit/types'

/** Original manual commit intent; contains no history rollback capability. */
export interface IPreparedCommitPush {
  readonly repository: Repository
  readonly head: IAssistedCommitHead
  readonly destination: AssistedCommitPushDestination
  readonly verifyAuthorization: () => void
}

/** In-memory push-only retry, tied to the successful local commit. */
export interface ICommitPushRequest extends IPreparedCommitPush {
  readonly head: { readonly ref: string; readonly sha: string }
  readonly publication: {
    pushed: boolean
    upstreamConfigured: boolean
    readonly resources: IAssistedCommitPublicationResources
  }
}

/** Freeze the assigned account's issuing session without acquiring a token. */
export function captureCommitPushAuthorization(
  repository: Repository,
  accountsStore: AccountsStore,
  accounts: () => ReadonlyArray<Account>,
  currentRepository: () => Repository
): () => void {
  const identity = getRepositoryAccountIdentity(repository)
  const account = getAccountForRepository(accounts(), repository)
  return () => {
    const current = currentRepository()
    const currentIdentity = getRepositoryAccountIdentity(current)
    if (
      current.id !== repository.id ||
      current.path !== repository.path ||
      (identity === null
        ? currentIdentity !== null
        : !isSameAccount(identity, currentIdentity))
    ) {
      throw new Error(
        'The repository account changed. The commit was saved locally. Review the assigned account and use Push.'
      )
    }
    if (identity !== null && account === null) {
      throw new Error(
        'The commit was saved locally. Sign in with the assigned account and use Push.'
      )
    }
    if (account !== null) {
      // Creation checks the original session synchronously, including retirement.
      accountsStore.createTokenGetter(account)
    }
  }
}

/** Snapshot native branch/destination before committing, excluding continuations. */
export async function prepareCommitPush(
  repository: Repository,
  verifyAuthorization: () => void
): Promise<IPreparedCommitPush | undefined> {
  const status = await getStatus(repository, false, true)
  if (
    status.mergeHeadFound ||
    status.squashMsgFound ||
    status.rebaseInternalState !== null ||
    status.isCherryPickingHeadFound
  ) {
    return undefined
  }
  const head = await readAssistedCommitHead(repository)
  return {
    repository,
    head,
    destination: await readAssistedCommitPushDestination(repository, head.ref),
    verifyAuthorization,
  }
}

/** Resolve Git's abbreviated result without authorizing another commit or merge. */
export async function createCommitPushRequest(
  prepared: IPreparedCommitPush,
  commitSHA: string
): Promise<ICommitPushRequest> {
  const commit = await getCommit(prepared.repository, commitSHA)
  if (
    commit === null ||
    prepared.head.ref === null ||
    commit.parentSHAs.length !== (prepared.head.sha === null ? 0 : 1) ||
    (prepared.head.sha !== null && commit.parentSHAs[0] !== prepared.head.sha)
  ) {
    throw new Error(
      'The commit was saved locally, but its original branch or parent changed. Review History and use Push.'
    )
  }
  return {
    ...prepared,
    head: { ref: prepared.head.ref, sha: commit.sha },
    publication: {
      pushed: false,
      upstreamConfigured: false,
      resources: { locks: [] },
    },
  }
}

/**
 * Push one accepted manual commit through Desktop's native pipeline.
 *
 * Retry never commits, changes account/destination, or repeats an acknowledged
 * push. Publication cleanup is the only retained native capability.
 */
export async function pushCommittedChanges(
  request: ICommitPushRequest,
  push: IAssistedCommitRepository['push'],
  refresh: () => Promise<void>,
  recordPush: () => void
): Promise<void> {
  const { repository, head, destination, publication } = request
  request.verifyAuthorization()
  if (destination.kind === 'unavailable') {
    throw destination.error
  }
  const completePublication = async () => {
    if (destination.publishBranch && !publication.upstreamConfigured) {
      await completeAssistedCommitPushPublication(
        repository,
        destination,
        head,
        publication.resources
      )
      publication.upstreamConfigured = true
    }
    await cleanupAssistedCommitPublication(publication.resources)
  }
  if (publication.pushed) {
    verifyAssistedCommitPushOwner(destination)
    await completePublication()
    await refresh()
    return
  }
  const branch = new Branch(
    head.ref.slice('refs/heads/'.length),
    destination.publishBranch
      ? null
      : `${destination.remote.name}/${destination.remoteRef.slice(
          'refs/heads/'.length
        )}`,
    { sha: head.sha },
    BranchType.Local,
    head.ref
  )
  const outcome = await push(
    repository,
    branch,
    destination.remote,
    {
      assistedCommit: {
        expectedTip: head.sha,
        remoteRef: destination.remoteRef,
        pushURL: destination.pushURL,
        rawPushURL: destination.rawPushURL,
        pushURLSource: destination.pushURLSource,
        prepareForSpawn: async () => {
          request.verifyAuthorization()
          const enter = await prepareAssistedCommitPushDestination(
            repository,
            destination,
            head
          )
          return () => {
            request.verifyAuthorization()
            enter()
          }
        },
      },
    },
    {
      onProgress: () => {},
      onPushed: () => {
        publication.pushed = true
        recordPush()
      },
      completePublication,
      verifyFollowUpOwner: () => verifyAssistedCommitPushOwner(destination),
    }
  )
  if (outcome.kind !== 'pushed') {
    throw outcome.error
  }
  if (outcome.refreshError !== undefined) {
    throw new Error(
      'The commit was pushed, but Desktop could not finish refreshing it. Retry to finish without pushing again.',
      { cause: outcome.refreshError }
    )
  }
}
