import {
  IAssistedCommitSnapshot,
  IValidatedAssistedCommitPlan,
} from '../../models/assisted-commit'
import { ICopilotAssistedCommitRequest } from '../../models/copilot-assisted-commit'
import { DiffSelectionType } from '../../models/diff'
import { planAssistedCommits } from '../assisted-commit-planning'
import { assistedCommitRequestsEqual } from '../assisted-commit-request'
import { arrayEquals } from '../equality'
import { getAccountForRepository } from '../get-account-for-repository'
import {
  AssistedCommitError,
  AssistedCommitProgress,
  createSingleAssistedCommitPlan,
  executeAssistedCommitPlan,
  getAssistedCommitExecutionMetadata,
  IAssistedCommitResult,
  validateAssistedCommitPlan,
  withAssistedCommitSnapshot,
} from '../git/assisted-commit'
import {
  acquireAssistedCommitGitLease,
  getAssistedCommitProtectedPaths,
  protectAssistedCommitResources,
  withoutRepositoryGitAccess,
} from '../git/repository-operation'
import { useRepoRulesLogic } from '../helpers/repo-rules'
import { AssistedCommitContext } from './context'
import { AssistedCommitDialogs } from './dialogs'
import { AssistedCommitReaders } from './readers'
import { AssistedCommitSelection } from './selection'
import { AssistedCommitState } from './state'
import { AssistedCommitPush } from './push'
import { verifyAcceptedOwner } from './push-ownership'
import {
  IAssistedCommitPreparedIntent,
  IAssistedCommitRepository,
  IAssistedCommitRun,
} from './types'

/** Concrete feature services used by plan-before-mutation execution. */
export interface IAssistedCommitExecution {
  readonly state: AssistedCommitState
  readonly context: AssistedCommitContext
  readonly dialogs: AssistedCommitDialogs
  readonly readers: AssistedCommitReaders
  readonly selections: AssistedCommitSelection
  readonly push: AssistedCommitPush
}

/** Plan the complete frozen selection before Desktop creates any commit. */
export async function executeAssistedCommitRun(
  run: IAssistedCommitRun,
  request: ICopilotAssistedCommitRequest,
  prepared: IAssistedCommitPreparedIntent | undefined,
  services: IAssistedCommitExecution
): Promise<IAssistedCommitResult> {
  const { state, context, dialogs, readers, selections, push } = services
  const repository = run.repository
  state.runs.set(repository.id, run)
  run.resourceProtection = protectAssistedCommitResources(repository.path)
  state.cache.update(repository, () => ({
    isCommitting: true,
    hookProgress: null,
    subscribeToCommitOutput: null,
  }))
  state.set(run, {
    kind: 'preparing',
    runId: run.id,
    cancelRequested: false,
  })
  if (
    request.intent !== undefined &&
    (prepared === undefined ||
      prepared.repository.path !== repository.path ||
      prepared.repository.id !== repository.id ||
      !assistedCommitRequestsEqual(prepared.request, request))
  ) {
    throw new AssistedCommitError(
      'selection-changed',
      'The first-click commit request changed. Review your selection and try again.'
    )
  }
  if (request.intent !== undefined) {
    state.intents.delete(request.intent)
  }
  context.assertInputs(run)
  state.protect(run, await getAssistedCommitProtectedPaths(repository.path))
  run.originalResourceProtection = run.resourceProtection
  const verifiedVersions = await readers.read(repository, run, async () => {
    if (run.pushAfterAssistedCommit && run.pushDestination === undefined) {
      run.pushDestination = await push.readDestination(
        repository,
        run.initialState
      )
    }
    return selections.verifyRequested(repository, run.request.files)
  })
  if (run.inputVersions === undefined) {
    run.inputVersions = verifiedVersions
  } else {
    if (!arrayEquals(run.inputVersions, verifiedVersions)) {
      throw new AssistedCommitError(
        'selection-changed',
        'Selected files changed after the first-click request. Review and reselect current changes.'
      )
    }
    await context.assertFreshInputs(run)
  }
  context.assertInputs(run)
  if (!(await context.copilot.isAssistedCommitRuntimeAvailable())) {
    throw new Error(
      'Copilot runtime is unavailable. Restart GitHub Desktop or reinstall it before trying assisted commits.'
    )
  }
  await context.assertFreshInputs(run)
  if (run.request.files.length > 0 && !dialogs.isConsentFresh()) {
    const accepted = await dialogs.requestConsent(run)
    if (!accepted && !run.controller.signal.aborted) {
      await selections.certifyUncaptured(run)
      run.declined = true
      throw new AssistedCommitError(
        'cancelled',
        'Assisted commit consent was declined'
      )
    }
  }
  await context.assertFreshInputs(run)
  const model =
    run.request.files.length === 0 ? undefined : await context.resolveModel(run)
  await context.assertFreshInputs(run)
  state.set(run, {
    kind: 'preparing',
    runId: run.id,
    cancelRequested: false,
  })
  context.check(run)
  state.protect(run, await getAssistedCommitProtectedPaths(repository.path))
  context.check(run)
  run.lease = await acquireAssistedCommitGitLease(
    repository.path,
    run.protectedPaths,
    () => verifyAcceptedOwner(run)
  )
  await context.assertFreshInputs(run)
  await run.lease.run(
    () => selections.verifyRequested(repository, run.request.files),
    true
  )
  await context.assertFreshInputs(run)
  const onProgress = (progress: AssistedCommitProgress) =>
    withoutRepositoryGitAccess(() => context.progress(run, progress))
  const options = { signal: run.controller.signal, onProgress }
  const result = await run.lease.run(() =>
    withAssistedCommitSnapshot(
      repository,
      run.request,
      async snapshot => {
        run.snapshot = snapshot
        context.check(run)
        selections.assertCapturedHead(run, snapshot.originalHead)
        await selections.verifyRequested(repository, run.request.files)
        await context.assertFreshInputs(run)
        run.snapshotAuthorized = true
        selections.retire(repository, run.request.files)
        const checked =
          snapshot.analysis.changes.length === 0
            ? await validateAssistedCommitPlan(
                snapshot,
                createSingleAssistedCommitPlan(snapshot, {
                  reason: 'empty-selection',
                  title: 'Empty commit',
                }),
                options
              )
            : await planAssistedCommits(
                snapshot,
                async (analysis, mode, signal) => {
                  context.check(run)
                  const account = run.account
                  if (account === undefined) {
                    throw new Error(
                      'Sign in to an account with Copilot for Desktop enabled'
                    )
                  }
                  const response = await withoutRepositoryGitAccess(() =>
                    context.copilot.proposeAssistedCommitPlan(
                      account,
                      analysis,
                      snapshot.repositoryPath,
                      {
                        request: model,
                        commitMessageRules:
                          run.initialState.changesState.currentRepoRulesInfo.commitMessagePatterns.getRules(),
                        mode,
                        signal,
                      }
                    )
                  )
                  context.check(run)
                  return response
                },
                {
                  ...options,
                  onPlanningProgress: progress =>
                    withoutRepositoryGitAccess(() => {
                      context.check(run)
                      state.set(run, {
                        kind:
                          progress.kind === 'planning'
                            ? 'analyzing'
                            : 'summarizing-selection',
                        runId: run.id,
                        cancelRequested: false,
                      })
                    }),
                }
              )
        run.plan = checked
        await validateAssistedCommitMessages(run, context, snapshot, checked)
        context.check(run)
        const result = await executeAssistedCommitPlan(snapshot, checked, {
          ...options,
          onVerifyCommit: commit => {
            context.check(run)
            if (
              snapshot.analysis.changes.length === 0 &&
              commit.message.split('\n')[0] !== 'Empty commit'
            ) {
              throw new AssistedCommitError(
                'commit-failed',
                'A commit hook changed the required Empty commit title'
              )
            }
            if (
              useRepoRulesLogic(
                getAccountForRepository(
                  context.configuration().accounts,
                  repository
                ),
                repository
              )
            ) {
              const rules = run.initialState.changesState.currentRepoRulesInfo
              if (
                rules.commitMessagePatterns.getFailedRules(commit.message)
                  .status === 'fail' ||
                rules.commitAuthorEmailPatterns.getFailedRules(
                  commit.author.email
                ).status === 'fail' ||
                rules.committerEmailPatterns.getFailedRules(
                  commit.committer.email
                ).status === 'fail'
              ) {
                throw new AssistedCommitError(
                  'unsafe-plan',
                  'The created commit message, author or committer does not meet repository rules'
                )
              }
            }
          },
          onHookProgress: progress =>
            withoutRepositoryGitAccess(() => {
              dialogs.hookProgress(repository)(progress)
              if (
                run.controller.signal.aborted &&
                progress.status === 'started'
              ) {
                progress.abort()
              }
            }),
          onHookFailure: (name, output) =>
            withoutRepositoryGitAccess(() =>
              dialogs.requestHookFailure(run, name, output)
            ),
          onTerminalOutputAvailable: subscribeToCommitOutput =>
            withoutRepositoryGitAccess(() => {
              state.cache.update(repository, () => ({
                subscribeToCommitOutput,
              }))
              state.events.changed()
            }),
        })
        run.result = result
        run.recoveryCapability = result
        return result
      },
      options
    )
  )
  return result
}

async function validateAssistedCommitMessages(
  run: IAssistedCommitRun,
  context: AssistedCommitContext,
  snapshot: IAssistedCommitSnapshot,
  checked: IValidatedAssistedCommitPlan
): Promise<void> {
  const account = getAccountForRepository(
    context.configuration().accounts,
    run.repository
  )
  if (!useRepoRulesLogic(account, run.repository)) {
    return
  }
  const rules = run.initialState.changesState.currentRepoRulesInfo
  const metadata = await getAssistedCommitExecutionMetadata(snapshot, checked, {
    signal: run.controller.signal,
  })
  const author = metadata.author
  context.check(run)
  const branch = snapshot.originalHead.ref?.replace(/^refs\/heads\//, '')
  if (
    rules.basicCommitWarning === true ||
    rules.signedCommitsRequired === true ||
    rules.pullRequestRequired === true ||
    (author !== null &&
      rules.commitAuthorEmailPatterns.getFailedRules(author.email).status ===
        'fail') ||
    (metadata.committer !== null &&
      rules.committerEmailPatterns.getFailedRules(metadata.committer.email)
        .status === 'fail') ||
    (run.initialState.aheadBehind === null &&
      (rules.creationRestricted === true ||
        (branch !== undefined &&
          rules.branchNamePatterns.getFailedRules(branch).status === 'fail')))
  ) {
    throw new AssistedCommitError(
      'unsafe-plan',
      "The commit author, committer or branch does not meet this repository's rules"
    )
  }
  for (const [index, commit] of checked.plan.commits.entries()) {
    const message = metadata.messages[index]
    context.check(run)
    if (rules.commitMessagePatterns.getFailedRules(message).status === 'fail') {
      throw new AssistedCommitError(
        'unsafe-plan',
        `The generated commit message "${commit.title}" does not meet this repository's rules`
      )
    }
  }
}

/** Record only verified locally accepted plan commits through the ordinary statistics path. */
export async function recordAssistedCommitStats(
  run: IAssistedCommitRun,
  repository: IAssistedCommitRepository
): Promise<void> {
  const plan = run.plan
  const snapshot = run.snapshot
  if (plan === undefined || snapshot === undefined) {
    throw new Error('Completed assisted commit run has no validated plan')
  }
  for (const commit of plan.plan.commits) {
    const paths = new Set(
      snapshot.analysis.changes
        .filter(change => commit.changeIds.includes(change.id))
        .map(change => change.path)
    )
    const partialSelection = run.request.files.some(
      file =>
        paths.has(file.path) &&
        (file.selection.getSelectionType() === DiffSelectionType.Partial ||
          snapshot.analysis.changes.some(
            change =>
              change.path === file.path && !commit.changeIds.includes(change.id)
          ))
    )
    await repository.recordCommit(
      run.repository,
      run.initialState,
      {
        summary: commit.title,
        description: commit.description ?? '',
        trailers: run.request.trailers,
        messageGeneratedByCopilot: snapshot.analysis.changes.length > 0,
      },
      run.request.files.filter(file => paths.has(file.path)),
      partialSelection
    )
  }
}
