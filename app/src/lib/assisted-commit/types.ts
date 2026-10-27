import { Account } from '../../models/account'
import {
  IAssistedCommitHead,
  IAssistedCommitSnapshot,
  IValidatedAssistedCommitPlan,
} from '../../models/assisted-commit'
import { CloningRepository } from '../../models/cloning-repository'
import { ICommitContext } from '../../models/commit'
import { ICopilotAssistedCommitRequest } from '../../models/copilot-assisted-commit'
import { Repository } from '../../models/repository'
import { WorkingDirectoryFileChange } from '../../models/status'
import { IRepositoryState } from '../app-state'
import { IBYOKProvider } from '../copilot/byok'
import {
  IAssistedCommitCleanupToken,
  IAssistedCommitRecovery,
  IAssistedCommitRecoveryToken,
  IAssistedCommitResult,
} from '../git/assisted-commit'
import {
  IAssistedCommitGitLease,
  IRepositoryGitResourceProtection,
} from '../git/repository-operation'
import {
  CopilotModelRequest,
  CopilotModelSelections,
} from '../stores/copilot-store'

/** AppStore's existing repository operations, not feature implementation callbacks. */
export interface IAssistedCommitRepository {
  readonly refresh: (
    repository: Repository,
    clearPartialState: boolean
  ) => Promise<void>
  readonly refreshAll: (repository: Repository) => Promise<void>
  readonly loadHistory: (repository: Repository) => Promise<void>
  readonly recordCommit: (
    repository: Repository,
    initialState: IRepositoryState,
    context: ICommitContext,
    files: ReadonlyArray<WorkingDirectoryFileChange>,
    partialSelection: boolean
  ) => Promise<void>
}

/** Read current preferences without copying ownership of AppStore's settings. */
export interface IAssistedCommitConfiguration {
  readonly accounts: ReadonlyArray<Account>
  readonly providers: ReadonlyArray<IBYOKProvider>
  readonly models: ReadonlyMap<string, CopilotModelSelections>
  readonly selectedRepository: Repository | CloningRepository | null
  readonly hideWhitespace: boolean
}

/** Shared ordinary/assisted model resolution, including existing keychain handling. */
export type AssistedCommitModelResolver = (
  selection: string | null
) => Promise<CopilotModelRequest>

/** Synchronous publication preserves the caller's observer failure semantics. */
export interface IAssistedCommitEvents {
  readonly changed: () => void
  readonly error: (error: Error) => void
}

/** First-click intent remains weakly owned and cannot authorize changed input. */
export interface IAssistedCommitPreparedIntent {
  readonly repository: Repository
  readonly request: ICopilotAssistedCommitRequest
  readonly initialState: IRepositoryState
  readonly account: Account | undefined
  readonly modelSelection: string | null
  readonly providerDefinition: string | null
  readonly providerRevision: number
  readonly versions: ReadonlyArray<string>
}

/** One native hook failure identity, shared by ordinary and assisted commits. */
export interface IAssistedCommitHookFailure {
  readonly present: () => void
  readonly resolve: (resolution: 'abort' | 'ignore') => void
  popupId?: number
}

/** A run retains all native capabilities until verified settlement or recovery. */
export interface IAssistedCommitRun {
  readonly id: string
  readonly repository: Repository
  readonly request: ICopilotAssistedCommitRequest
  readonly initialState: IRepositoryState
  readonly account: Account | undefined
  readonly modelSelection: string | null
  readonly providerDefinition: string | null
  readonly providerRevision: number
  readonly controller: AbortController
  readonly selectionReaders: Set<Promise<void>>
  settlement: IAssistedCommitSettlement
  selectionReadersClosed: boolean
  resourceProtection?: IRepositoryGitResourceProtection
  inputVersions?: ReadonlyArray<string>
  protectedPaths?: ReadonlyArray<string>
  lease?: IAssistedCommitGitLease
  snapshot?: IAssistedCommitSnapshot
  snapshotAuthorized?: boolean
  plan?: IValidatedAssistedCommitPlan
  result?: IAssistedCommitResult
  recovery?: IAssistedCommitRecovery
  recoveryCapability?: IAssistedCommitResult | IAssistedCommitRecoveryToken
  authorizationError?: Error
  consent?: {
    readonly popupId?: number
    readonly resolve: (accepted: boolean) => void
  }
  hookFailure?: IAssistedCommitHookFailure
  finalized: boolean
  finished: boolean
  reconciling?: boolean
  selectionReadError?: unknown
  declined?: boolean
  selectionFence?: {
    readonly head: IAssistedCommitHead
    readonly versions: ReadonlyArray<string>
  }
  cleanupPending?: boolean
  cleanupToken?: IAssistedCommitCleanupToken
}

/** Completion of one exact run or manual-consumption owner. */
export interface IAssistedCommitSettlement {
  readonly done: Promise<void>
  readonly complete: () => void
}

/** Readers await settlement rather than inferring it from a published error. */
export function createAssistedCommitSettlement(): IAssistedCommitSettlement {
  let complete: () => void = () => {}
  const done = new Promise<void>(resolve => {
    complete = resolve
  })
  return { done, complete }
}
