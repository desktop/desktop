import { randomUUID } from 'crypto'
import {
  AssistedCommitRunOutcome,
  isAssistedCommitRepositoryLocked,
} from '../../models/assisted-commit-run'
import { ICopilotAssistedCommitRequest } from '../../models/copilot-assisted-commit'
import { Repository } from '../../models/repository'
import { freezeAssistedCommitRequest } from '../assisted-commit-request'
import {
  acceptVerifiedAssistedCommitTransaction,
  AssistedCommitError,
  AssistedCommitProgress,
  finalizeAssistedCommitTransaction,
  IAssistedCommitResult,
} from '../git/assisted-commit'
import {
  isRepositoryAffectedByAssistedCommit,
  isRepositoryGitMutationInProgress,
  withoutRepositoryGitAccess,
  withRepositoryGitErrorPropagation,
} from '../git/repository-operation'
import { PopupManager } from '../popup-manager'
import { AccountsStore } from '../stores/accounts-store'
import { CopilotStore } from '../stores/copilot-store'
import { RepositoryStateCache } from '../stores/repository-state-cache'
import { AssistedCommitContext } from './context'
import { AssistedCommitDialogs } from './dialogs'
import { executeAssistedCommitRun } from './execution'
import { AssistedCommitReaders } from './readers'
import {
  AssistedCommitRecovery,
  createAssistedCommitRecovery,
} from './recovery'
import { AssistedCommitSelection } from './selection'
import { AssistedCommitState } from './state'
import { AssistedCommitPush } from './push'
import {
  AssistedCommitModelResolver,
  createAssistedCommitSettlement,
  IAssistedCommitConfiguration,
  IAssistedCommitEvents,
  IAssistedCommitRepository,
  IAssistedCommitRun,
} from './types'

/** One awaited request composes feature-owned execution, selection and recovery. */
export class AssistedCommitCoordinator {
  /** Run/resource ownership and observable UI state. */
  public readonly state: AssistedCommitState
  /** Original and restored selected-change authority. */
  public readonly selections: AssistedCommitSelection
  /** Associated reader lifetimes and deferred repository refresh delivery. */
  public readonly readers: AssistedCommitReaders
  /** Native consent and hook dialog identities. */
  public readonly dialogs: AssistedCommitDialogs
  /** Issuing credential/model intent and revocation. */
  public readonly context: AssistedCommitContext
  /** Retained recovery capabilities and settlement. */
  public readonly recovery: AssistedCommitRecovery
  /** Optional native push and push-only retry retain the accepted run owner. */
  public readonly push: AssistedCommitPush

  public constructor(
    cache: RepositoryStateCache,
    accounts: AccountsStore,
    copilot: CopilotStore,
    popups: PopupManager,
    private readonly repository: IAssistedCommitRepository,
    configuration: () => IAssistedCommitConfiguration,
    resolveModel: AssistedCommitModelResolver,
    events: IAssistedCommitEvents
  ) {
    this.state = new AssistedCommitState(cache, events)
    this.selections = new AssistedCommitSelection(
      cache,
      () => configuration().hideWhitespace
    )
    this.context = new AssistedCommitContext(
      this.state,
      accounts,
      copilot,
      configuration,
      resolveModel
    )
    this.readers = new AssistedCommitReaders(
      this.state,
      this.selections,
      this.context,
      repository,
      configuration
    )
    this.dialogs = new AssistedCommitDialogs(this.state, popups)
    this.recovery = createAssistedCommitRecovery(
      this.state,
      this.readers,
      this.selections,
      this.context,
      repository,
      () => this.push
    )
    this.push = new AssistedCommitPush(
      this.state,
      this.context,
      this.dialogs,
      this.readers,
      this.recovery,
      repository,
      (run, result) => this.acceptLocal(run, result)
    )
  }

  /** Freeze first-click intent before any confirmation or asynchronous preflight. */
  public async prepare(
    repository: Repository,
    request: ICopilotAssistedCommitRequest
  ): Promise<ICopilotAssistedCommitRequest> {
    this.state.assertAvailable(repository)
    if (isRepositoryGitMutationInProgress(repository.path)) {
      throw new AssistedCommitError(
        'busy',
        'Finish the current Git operation before starting assisted commits'
      )
    }
    if (isRepositoryAffectedByAssistedCommit(repository.path)) {
      throw new AssistedCommitError(
        'busy',
        'Another assisted run uses these working files or shared Git metadata'
      )
    }
    const initialState = this.state.cache.get(repository)
    const { account, modelSelection } = this.context.getIntent(repository)
    const frozen = freezeAssistedCommitRequest(request)
    const providerDefinition = this.context.providerDefinition(modelSelection)
    const providerRevision = this.context.providerRevision(modelSelection)
    const { versions, pushDestination } = await this.readers.read(
      repository,
      undefined,
      async () => ({
        pushDestination: initialState.changesState.pushAfterAssistedCommit
          ? await this.push.readDestination(repository, initialState)
          : undefined,
        versions: await this.selections.verifyRequested(
          repository,
          frozen.files
        ),
      })
    )
    const intent = Object.freeze({ id: randomUUID() })
    this.state.intents.set(intent, {
      repository,
      request: frozen,
      initialState,
      account,
      modelSelection,
      providerDefinition,
      providerRevision,
      versions,
      pushDestination,
    })
    return Object.freeze({ ...frozen, intent })
  }

  /**
   * Accept verified local history without an await after the final auth/cancel check.
   *
   * Push instead finalizes inside its synchronous native before-mutation fence.
   */
  public acceptLocal(
    run: IAssistedCommitRun,
    result: IAssistedCommitResult
  ): void {
    finalizeAssistedCommitTransaction(result)
    this.state.accept(run, { kind: 'idle' })
    this.state.events.changed()
  }

  /** Await execution, local acceptance and complete settlement as one operation. */
  public async create(
    repository: Repository,
    request: ICopilotAssistedCommitRequest
  ): Promise<AssistedCommitRunOutcome> {
    const currentState = this.state.cache.get(repository)
    const prepared =
      request.intent === undefined
        ? undefined
        : this.state.intents.get(request.intent)
    const initialState = prepared?.initialState ?? currentState
    const previous = this.state.runs.get(repository.id)
    if (
      currentState.isCommitting ||
      isRepositoryGitMutationInProgress(repository.path) ||
      isRepositoryAffectedByAssistedCommit(repository.path) ||
      this.state.selectionReaders.has(repository.id) ||
      isAssistedCommitRepositoryLocked(
        currentState.changesState.assistedCommit
      ) ||
      currentState.isGeneratingCommitMessage ||
      currentState.isPushPullFetchInProgress ||
      currentState.checkoutProgress !== null ||
      currentState.revertProgress !== null ||
      previous?.lease !== undefined ||
      (previous !== undefined && !previous.finished)
    ) {
      return { kind: 'busy' }
    }
    const { account, modelSelection } =
      prepared ?? this.context.getIntent(repository)
    const run: IAssistedCommitRun = {
      id: randomUUID(),
      repository,
      request: freezeAssistedCommitRequest(request),
      initialState,
      pushAfterAssistedCommit:
        initialState.changesState.pushAfterAssistedCommit,
      pushDestination: prepared?.pushDestination,
      publicationResources: { locks: [] },
      account,
      modelSelection,
      controller: new AbortController(),
      selectionReaders: new Set<Promise<void>>(),
      settlement: createAssistedCommitSettlement(),
      selectionReadersClosed: false,
      providerRevision:
        prepared?.providerRevision ??
        this.context.providerRevision(modelSelection),
      providerDefinition:
        prepared !== undefined
          ? prepared.providerDefinition
          : this.context.providerDefinition(modelSelection),
      finalized: false,
      finished: false,
      inputVersions: prepared?.versions,
    }
    let outcome: AssistedCommitRunOutcome | undefined
    let verifiedCancellation = false

    try {
      const result = await executeAssistedCommitRun(run, request, prepared, {
        state: this.state,
        context: this.context,
        dialogs: this.dialogs,
        readers: this.readers,
        selections: this.selections,
        push: this.push,
      })
      if (run.lease === undefined) {
        throw new AssistedCommitError(
          'disposed',
          'Assisted commit Git ownership was released'
        )
      }
      const options = {
        signal: run.controller.signal,
        onProgress: (progress: AssistedCommitProgress) =>
          withoutRepositoryGitAccess(() =>
            this.context.progress(run, progress)
          ),
      }
      this.context.check(run)
      this.state.set(run, {
        kind: 'finishing',
        runId: run.id,
        cancelRequested: false,
      })
      await run.lease.run(() => this.recovery.refresh(repository, true), true)
      this.context.check(run)
      const deferredBeforeAcceptance = this.readers.takeRefresh(repository)
      if (deferredBeforeAcceptance !== undefined) {
        await run.lease.run(
          () =>
            withRepositoryGitErrorPropagation(() =>
              this.repository.refreshAll(deferredBeforeAcceptance ?? repository)
            ),
          true
        )
        this.state.cache.updateChangesState(repository, changes => ({
          workingDirectory: changes.workingDirectory.withIncludeAllFiles(false),
        }))
      }
      if (run.pushAfterAssistedCommit) {
        outcome = await this.push.execute(run, result)
      } else {
        await run.lease.run(
          () =>
            acceptVerifiedAssistedCommitTransaction(
              result,
              () => {
                this.context.check(run)
                this.state.set(run, {
                  kind: 'closing',
                  runId: run.id,
                })
              },
              options
            ),
          true
        )
        this.acceptLocal(run, result)
        outcome = { kind: 'local-ready', result }
      }
    } catch (error) {
      const failure = await this.recovery.handleFailure(run, error)
      outcome = failure.outcome
      verifiedCancellation = failure.verifiedCancellation
    } finally {
      outcome = await this.recovery.finish(run, outcome, verifiedCancellation)
    }
    if (outcome === undefined) {
      throw new Error('Assisted commit run settled without an outcome')
    }
    return outcome
  }
}
