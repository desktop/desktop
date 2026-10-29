import { Account, CopilotLicenseTypeNoAccess } from '../../models/account'
import { isAssistedCommitRunBusy } from '../../models/assisted-commit-run'
import { DiffSelectionType } from '../../models/diff'
import { Repository } from '../../models/repository'
import { tipEquals } from '../../models/tip'
import {
  assistedCommitRequestsEqual,
  getAssistedCommitInputVersions,
} from '../assisted-commit-request'
import { isAssistedCommitCancellation } from '../assisted-commit-run'
import { parseModelKey } from '../copilot/byok'
import { AccountRequiresSignInError } from '../credential-sessions'
import { arrayEquals } from '../equality'
import {
  enableCopilotAssistedCommit,
  enableCopilotSdkCommitMessageGeneration,
} from '../feature-flag'
import { getAccountForCommitMessageGeneration } from '../get-account-for-repository'
import {
  AssistedCommitError,
  AssistedCommitProgress,
  checkAssistedCommitCancellation,
} from '../git/assisted-commit'
import { AccountsStore } from '../stores/accounts-store'
import {
  CopilotModelRequest,
  CopilotStore,
  getCopilotAccountCacheKey,
} from '../stores/copilot-store'
import { assistedCommitHeadMatches } from './selection'
import { AssistedCommitState } from './state'
import {
  AssistedCommitModelResolver,
  IAssistedCommitConfiguration,
  IAssistedCommitRun,
} from './types'

/** Maintains frozen account/model intent and revocation without owning user preferences. */
export class AssistedCommitContext {
  private readonly providerRevisions = new Map<string, number>()

  public constructor(
    private readonly state: AssistedCommitState,
    private readonly accountsStore: AccountsStore,
    public readonly copilot: CopilotStore,
    public readonly configuration: () => IAssistedCommitConfiguration,
    private readonly resolveModelRequest: AssistedCommitModelResolver
  ) {}

  /** Capture the current account and its existing ordinary-generation model choice. */
  public getIntent(repository: Repository): {
    readonly account: Account | undefined
    readonly modelSelection: string | null
  } {
    const settings = this.configuration()
    const account = getAccountForCommitMessageGeneration(
      settings.accounts,
      repository
    )
    return {
      account,
      modelSelection:
        account === undefined
          ? null
          : settings.models.get(getCopilotAccountCacheKey(account))?.[
              'commit-message-generation'
            ] ?? null,
    }
  }

  /** Eligibility is presentation/admission data, never transaction authority. */
  public async isAvailable(repository: Repository): Promise<boolean> {
    const { account } = this.getIntent(repository)
    return (
      enableCopilotAssistedCommit() &&
      account !== undefined &&
      account.token.length > 0 &&
      account.copilotLicenseType !== CopilotLicenseTypeNoAccess &&
      enableCopilotSdkCommitMessageGeneration(account) &&
      (await this.copilot.isAssistedCommitRuntimeAvailable())
    )
  }

  /** Revalidate account session, provider revision and cooperative cancellation. */
  public check(run: IAssistedCommitRun): void {
    if (this.state.runs.get(run.repository.id) !== run) {
      throw new AssistedCommitError(
        'disposed',
        'Assisted commit run was replaced'
      )
    }
    const account = getAccountForCommitMessageGeneration(
      this.configuration().accounts,
      run.repository
    )
    let authorizationError: Error | undefined
    if (
      !enableCopilotAssistedCommit() ||
      account === undefined ||
      run.account === undefined ||
      account.token.length === 0 ||
      !enableCopilotSdkCommitMessageGeneration(account) ||
      account.copilotLicenseType === CopilotLicenseTypeNoAccess ||
      account.id !== run.account.id ||
      account.endpoint !== run.account.endpoint
    ) {
      authorizationError = new Error(
        'Copilot access changed. Sign in to an account with Copilot for Desktop enabled and try again.'
      )
    } else if (run.request.files.length > 0) {
      try {
        // Validate issuing sessions without acquiring tokens or treating rotation as sign-out.
        this.accountsStore.createTokenGetter(run.account)
        this.accountsStore.createTokenGetter(account)
      } catch (error) {
        if (!(error instanceof AccountRequiresSignInError)) {
          throw error
        }
        authorizationError = error
      }
    }
    if (authorizationError !== undefined) {
      run.authorizationError = authorizationError
      run.controller.abort()
      run.consent?.resolve(false)
      run.hookFailure?.resolve('abort')
      throw run.authorizationError
    }
    if (
      run.request.files.length > 0 &&
      (this.providerDefinition(run.modelSelection) !== run.providerDefinition ||
        this.providerRevision(run.modelSelection) !== run.providerRevision)
    ) {
      run.authorizationError = new Error(
        'The selected custom Copilot provider, model, or credential changed. Review Copilot settings and try again.'
      )
      run.controller.abort()
      run.consent?.resolve(false)
      run.hookFailure?.resolve('abort')
      throw run.authorizationError
    }
    checkAssistedCommitCancellation(run.controller.signal)
  }

  /** Account updates revoke affected unfinished requests, not rotated tokens. */
  public abortUnauthorized(): void {
    for (const run of this.state.runs.values()) {
      if (
        run.finalized ||
        this.state.cache.get(run.repository).changesState.assistedCommit
          .kind === 'closing' ||
        !isAssistedCommitRunBusy(
          this.state.cache.get(run.repository).changesState.assistedCommit
        )
      ) {
        continue
      }
      try {
        this.check(run)
      } catch (error) {
        if (isAssistedCommitCancellation(error)) {
          continue
        }
        if (run.authorizationError === undefined) {
          throw error
        }
        this.state.cancel(run.repository, run.id)
      }
    }
  }

  /** Reject changed selection, branch intent, mode or captured commit options. */
  public assertInputs(run: IAssistedCommitRun): void {
    this.check(run)
    const state = this.state.cache.get(run.repository)
    const currentRequest = {
      ...run.request,
      files: state.changesState.workingDirectory.files.filter(
        file => file.selection.getSelectionType() !== DiffSelectionType.None
      ),
      skipCommitHooks: state.skipCommitHooks,
      signOffCommits: state.signOffCommits,
      allowEmptyCommit: state.allowEmptyCommit,
    }
    if (
      state.changesState.commitMode !== 'copilot' ||
      run.repository.isTutorialRepository ||
      state.commitToAmend !== null ||
      state.multiCommitOperationState !== null ||
      state.changesState.conflictState !== null ||
      !assistedCommitRequestsEqual(run.request, currentRequest) ||
      state.changesState.pushAfterAssistedCommit !==
        run.pushAfterAssistedCommit ||
      JSON.stringify(state.changesState.coAuthors) !==
        JSON.stringify(run.initialState.changesState.coAuthors) ||
      state.changesState.showCoAuthoredBy !==
        run.initialState.changesState.showCoAuthoredBy ||
      !tipEquals(state.branchesState.tip, run.initialState.branchesState.tip) ||
      !assistedCommitHeadMatches(
        run.initialState.branchesState.tip,
        state.branchesState.tip
      )
    ) {
      throw new AssistedCommitError(
        'selection-changed',
        'The selected changes or commit options changed. Review your selection and try again.'
      )
    }
    if (run.request.files.length === 0 && !run.request.allowEmptyCommit) {
      throw new AssistedCommitError(
        'unsafe-selection',
        'Select changes or enable Allow empty commit'
      )
    }
  }

  /** Recheck filesystem freshness and intent across the asynchronous read. */
  public async assertFreshInputs(run: IAssistedCommitRun): Promise<void> {
    this.assertInputs(run)
    const versions = await getAssistedCommitInputVersions(
      run.repository,
      run.request.files
    )
    this.assertInputs(run)
    if (
      run.inputVersions === undefined ||
      !arrayEquals(versions, run.inputVersions)
    ) {
      throw new AssistedCommitError(
        'selection-changed',
        'Selected files changed while waiting. Review your selection and try again.'
      )
    }
  }

  /** Capture the selected non-secret custom provider and model definition. */
  public providerDefinition(selection: string | null): string | null {
    if (selection === null) {
      return null
    }
    const key = parseModelKey(selection)
    if (key.kind !== 'byok') {
      return null
    }
    const provider = this.configuration().providers.find(
      provider => provider.id === key.providerId
    )
    const model = provider?.models.find(model => model.id === key.modelId)
    return provider === undefined || model === undefined
      ? null
      : JSON.stringify({ ...provider, models: [model] })
  }

  /** Credential replacement advances revision even when definitions match. */
  public providerRevision(selection: string | null): number {
    const key = selection === null ? null : parseModelKey(selection)
    return key?.kind === 'byok'
      ? this.providerRevisions.get(key.providerId) ?? 0
      : 0
  }

  /** Revoke active requests using a modified custom provider or credential. */
  public invalidateProvider(providerId: string): void {
    this.providerRevisions.set(
      providerId,
      (this.providerRevisions.get(providerId) ?? 0) + 1
    )
    for (const run of this.state.runs.values()) {
      const key =
        run.modelSelection === null ? null : parseModelKey(run.modelSelection)
      if (
        run.request.files.length > 0 &&
        !run.finalized &&
        key?.kind === 'byok' &&
        key.providerId === providerId &&
        this.state.cache.get(run.repository).changesState.assistedCommit
          .kind !== 'closing'
      ) {
        run.authorizationError = new Error(
          'The selected custom Copilot provider or credential changed. Review Copilot settings and try again.'
        )
        run.controller.abort()
        run.consent?.resolve(false)
        run.hookFailure?.resolve('abort')
      }
    }
  }

  /** Resolve credentials only for the originally selected provider and model. */
  public async resolveModel(
    run: IAssistedCommitRun
  ): Promise<CopilotModelRequest> {
    if (
      run.modelSelection !== null &&
      parseModelKey(run.modelSelection).kind === 'byok' &&
      (run.providerDefinition === null ||
        this.providerDefinition(run.modelSelection) !== run.providerDefinition)
    ) {
      throw new Error(
        'The selected custom Copilot provider or model changed. Review Copilot settings and try again.'
      )
    }
    const request = await this.resolveModelRequest(run.modelSelection)
    if (
      this.providerDefinition(run.modelSelection) !== run.providerDefinition
    ) {
      throw new Error(
        'The selected custom Copilot provider or model changed while reading its credential.'
      )
    }
    return request
  }

  /** Progress verifies intent but never infers success from a committed callback. */
  public progress(
    run: IAssistedCommitRun,
    progress: AssistedCommitProgress
  ): void {
    if (progress.kind === 'rolling-back') {
      this.state.set(run, {
        kind: 'rolling-back',
        runId: run.id,
      })
      return
    }
    this.check(run)
    if (progress.kind === 'committed') {
      return
    }
    this.state.set(
      run,
      progress.kind === 'committing'
        ? { ...progress, runId: run.id, cancelRequested: false }
        : { kind: progress.kind, runId: run.id, cancelRequested: false }
    )
  }
}
