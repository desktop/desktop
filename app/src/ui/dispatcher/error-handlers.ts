import {
  GitError as DugiteError,
  RepositoryDoesNotExistErrorCode,
} from 'dugite'

import { Dispatcher } from '.'
import { ExternalEditorError } from '../../lib/editors/shared'
import {
  DiscardChangesError,
  ErrorWithMetadata,
} from '../../lib/error-with-metadata'
import { GitError, isAuthFailureError } from '../../lib/git/core'
import { ShellError } from '../../lib/shells'
import { UpstreamAlreadyExistsError } from '../../lib/stores/upstream-already-exists-error'

import { PopupType } from '../../models/popup'
import {
  Repository,
  isRepositoryWithGitHubRepository,
} from '../../models/repository'
import { hasWritePermission } from '../../models/github-repository'
import { RetryActionType } from '../../models/retry-actions'
import { parseFilesToBeOverwritten } from '../lib/parse-files-to-be-overwritten'

/** An error which also has a code property. */
interface IErrorWithCode extends Error {
  readonly code: string
}

/**
 * A type-guard method which determines whether the given object is an
 * Error instance with a `code` string property. This type of error
 * is commonly returned by NodeJS process- and file system libraries
 * as well as Dugite.
 *
 * See https://nodejs.org/api/util.html#util_util_getsystemerrorname_err
 */
function isErrorWithCode(error: any): error is IErrorWithCode {
  return error instanceof Error && typeof (error as any).code === 'string'
}

/**
 * Cast the error to an error containing a code if it has a code. Otherwise
 * return null.
 */
function asErrorWithCode(error: Error): IErrorWithCode | null {
  return isErrorWithCode(error) ? error : null
}

/**
 * Cast the error to an error with metadata if possible. Otherwise return null.
 */
function asErrorWithMetadata(error: Error): ErrorWithMetadata | null {
  if (error instanceof ErrorWithMetadata) {
    return error
  } else {
    return null
  }
}

/** Cast the error to a `GitError` if possible. Otherwise return null. */
function asGitError(error: Error): GitError | null {
  if (error instanceof GitError) {
    return error
  } else {
    return null
  }
}

function asEditorError(error: Error): ExternalEditorError | null {
  if (error instanceof ExternalEditorError) {
    return error
  }
  return null
}

/** Handle errors by presenting them. */
export async function defaultErrorHandler(
  error: Error,
  dispatcher: Dispatcher
): Promise<Error | null> {
  const e = asErrorWithMetadata(error) || error
  await dispatcher.presentError(e)

  return null
}

/** Handler for when a repository disappears 😱. */
export async function missingRepositoryHandler(
  error: Error,
  dispatcher: Dispatcher
): Promise<Error | null> {
  const e = asErrorWithMetadata(error)
  if (!e) {
    return error
  }

  const repository = e.metadata.repository
  if (!repository || !(repository instanceof Repository)) {
    return error
  }

  if (repository.missing) {
    return null
  }

  const errorWithCode = asErrorWithCode(e.underlyingError)
  const gitError = asGitError(e.underlyingError)
  const missing =
    (gitError && gitError.result.gitError === DugiteError.NotAGitRepository) ||
    (errorWithCode && errorWithCode.code === RepositoryDoesNotExistErrorCode)

  if (missing) {
    await dispatcher.updateRepositoryMissing(repository, true)
    return null
  }

  return error
}

/** Handle errors that happen as a result of a background task. */
export async function backgroundTaskHandler(
  error: Error,
  dispatcher: Dispatcher
): Promise<Error | null> {
  const e = asErrorWithMetadata(error)
  if (!e) {
    return error
  }

  const metadata = e.metadata
  // Ignore errors from background tasks. We might want more nuance here in the
  // future, but this'll do for now.
  if (metadata.backgroundTask) {
    return null
  } else {
    return error
  }
}

export async function externalEditorErrorHandler(
  error: Error,
  dispatcher: Dispatcher
): Promise<Error | null> {
  const e = asEditorError(error)
  if (!e) {
    return error
  }

  const { suggestDefaultEditor, openPreferences } = e.metadata

  await dispatcher.showPopup({
    type: PopupType.ExternalEditorFailed,
    message: e.message,
    suggestDefaultEditor,
    openPreferences,
  })

  return null
}

export async function openShellErrorHandler(
  error: Error,
  dispatcher: Dispatcher
): Promise<Error | null> {
  if (!(error instanceof ShellError)) {
    return error
  }

  await dispatcher.showPopup({
    type: PopupType.OpenShellFailed,
    message: error.message,
  })

  return null
}

/** Handle errors where they need to pull before pushing. */
export async function pushNeedsPullHandler(
  error: Error,
  dispatcher: Dispatcher
): Promise<Error | null> {
  const e = asErrorWithMetadata(error)
  if (!e) {
    return error
  }

  const gitError = asGitError(e.underlyingError)
  if (!gitError) {
    return error
  }

  const dugiteError = gitError.result.gitError
  if (dugiteError === null) {
    return error
  }

  if (dugiteError !== DugiteError.PushNotFastForward) {
    return error
  }

  const repository = e.metadata.repository
  if (!repository) {
    return error
  }

  if (!(repository instanceof Repository)) {
    return error
  }

  dispatcher.showPopup({ type: PopupType.PushNeedsPull, repository })

  return null
}

/**
 * Handler for detecting when a merge conflict is reported to direct the user
 * to a different dialog than the generic Git error dialog.
 */
export async function mergeConflictHandler(
  error: Error,
  dispatcher: Dispatcher
): Promise<Error | null> {
  const e = asErrorWithMetadata(error)
  if (!e) {
    return error
  }

  const gitError = asGitError(e.underlyingError)
  if (!gitError) {
    return error
  }

  const dugiteError = gitError.result.gitError
  if (dugiteError === null) {
    return error
  }

  if (dugiteError !== DugiteError.MergeConflicts) {
    return error
  }

  const { repository, gitContext } = e.metadata
  if (repository == null) {
    return error
  }

  if (!(repository instanceof Repository)) {
    return error
  }

  if (gitContext == null) {
    return error
  }

  if (!(gitContext.kind === 'merge' || gitContext.kind === 'pull')) {
    return error
  }

  switch (gitContext.kind) {
    case 'pull':
      dispatcher.incrementMetric('mergeConflictFromPullCount')
      break
    case 'merge':
      dispatcher.incrementMetric('mergeConflictFromExplicitMergeCount')
      break
  }

  const { currentBranch, theirBranch } = gitContext

  dispatcher.handleConflictsDetectedOnError(
    repository,
    currentBranch,
    theirBranch
  )

  return null
}

/**
 * Handler for when we attempt to install the global LFS filters and LFS throws
 * an error.
 */
export async function lfsAttributeMismatchHandler(
  error: Error,
  dispatcher: Dispatcher
): Promise<Error | null> {
  const gitError = asGitError(error)
  if (!gitError) {
    return error
  }

  const dugiteError = gitError.result.gitError
  if (dugiteError === null) {
    return error
  }

  if (dugiteError !== DugiteError.LFSAttributeDoesNotMatch) {
    return error
  }

  dispatcher.showPopup({ type: PopupType.LFSAttributeMismatch })

  return null
}

/**
 * Handler for when an upstream remote already exists but doesn't actually match
 * the upstream repository.
 */
export async function upstreamAlreadyExistsHandler(
  error: Error,
  dispatcher: Dispatcher
): Promise<Error | null> {
  if (!(error instanceof UpstreamAlreadyExistsError)) {
    return error
  }

  dispatcher.showPopup({
    type: PopupType.UpstreamAlreadyExists,
    repository: error.repository,
    existingRemote: error.existingRemote,
  })

  return null
}

/*
 * Handler for detecting when a merge conflict is reported to direct the user
 * to a different dialog than the generic Git error dialog.
 */
export async function rebaseConflictsHandler(
  error: Error,
  dispatcher: Dispatcher
): Promise<Error | null> {
  const e = asErrorWithMetadata(error)
  if (!e) {
    return error
  }

  const gitError = asGitError(e.underlyingError)
  if (!gitError) {
    return error
  }

  const dugiteError = gitError.result.gitError
  if (dugiteError === null) {
    return error
  }

  if (dugiteError !== DugiteError.RebaseConflicts) {
    return error
  }

  const { repository, gitContext } = e.metadata
  if (repository == null) {
    return error
  }

  if (!(repository instanceof Repository)) {
    return error
  }

  if (gitContext == null) {
    return error
  }

  if (gitContext.kind !== 'merge' && gitContext.kind !== 'pull') {
    return error
  }

  const { currentBranch } = gitContext

  dispatcher.launchRebaseOperation(repository, currentBranch)

  return null
}

const rejectedPathRe =
  /^ ! \[remote rejected\] .*? -> .*? \(refusing to allow an OAuth App to create or update workflow `(.*?)` without `workflow` scope\)/m

/**
 * Attempts to detect whether an error is the result of a failed push
 * due to insufficient OAuth permissions (missing workflow scope)
 */
export async function refusedWorkflowUpdate(
  error: Error,
  dispatcher: Dispatcher
) {
  const e = asErrorWithMetadata(error)
  if (!e) {
    return error
  }

  const gitError = asGitError(e.underlyingError)
  if (!gitError) {
    return error
  }

  const { repository } = e.metadata

  if (!(repository instanceof Repository)) {
    return error
  }

  if (!isRepositoryWithGitHubRepository(repository)) {
    return error
  }

  const match = rejectedPathRe.exec(error.message)

  if (!match) {
    return error
  }

  dispatcher.showPopup({
    type: PopupType.PushRejectedDueToMissingWorkflowScope,
    rejectedPath: match[1],
    repository,
  })

  return null
}

const samlReauthErrorMessageRe =
  /`([^']+)' organization has enabled or enforced SAML SSO.*?you must re-authorize/s

/**
 * Attempts to detect whether an error is the result of a failed push
 * due to insufficient OAuth permissions (missing workflow scope)
 */
export async function samlReauthRequired(error: Error, dispatcher: Dispatcher) {
  const e = asErrorWithMetadata(error)
  if (!e) {
    return error
  }

  const gitError = asGitError(e.underlyingError)
  if (!gitError || gitError.result.gitError === null) {
    return error
  }

  if (!isAuthFailureError(gitError.result.gitError)) {
    return error
  }

  const { repository } = e.metadata

  if (!(repository instanceof Repository)) {
    return error
  }

  if (repository.gitHubRepository === null) {
    return error
  }

  const remoteMessage = getRemoteMessage(gitError.result.stderr)
  const match = samlReauthErrorMessageRe.exec(remoteMessage)

  if (!match) {
    return error
  }

  const organizationName = match[1]
  const endpoint = repository.gitHubRepository.endpoint

  dispatcher.showPopup({
    type: PopupType.SAMLReauthRequired,
    organizationName,
    endpoint,
    retryAction: e.metadata.retryAction,
  })

  return null
}

/**
 * Attempts to detect whether an error is the result of a failed push
 * due to insufficient GitHub permissions. (No `write` access.)
 */
export async function insufficientGitHubRepoPermissions(
  error: Error,
  dispatcher: Dispatcher
) {
  const e = asErrorWithMetadata(error)
  if (!e) {
    return error
  }

  const gitError = asGitError(e.underlyingError)
  if (!gitError || gitError.result.gitError === null) {
    return error
  }

  if (!isAuthFailureError(gitError.result.gitError)) {
    return error
  }

  const { repository, retryAction } = e.metadata

  if (
    !(repository instanceof Repository) ||
    !isRepositoryWithGitHubRepository(repository)
  ) {
    return error
  }

  if (retryAction === undefined || retryAction.type !== RetryActionType.Push) {
    return error
  }

  if (hasWritePermission(repository.gitHubRepository)) {
    return error
  }

  dispatcher.showCreateForkDialog(repository)

  return null
}

/**
 * Handler for when an action the user attempts cannot be done because there are local
 * changes that would get overwritten.
 */
export async function localChangesOverwrittenHandler(
  error: Error,
  dispatcher: Dispatcher
): Promise<Error | null> {
  const e = asErrorWithMetadata(error)
  if (e === null) {
    return error
  }

  const gitError = asGitError(e.underlyingError)
  if (gitError === null) {
    return error
  }

  const dugiteError = gitError.result.gitError

  if (
    dugiteError !== DugiteError.LocalChangesOverwritten &&
    dugiteError !== DugiteError.MergeWithLocalChanges &&
    dugiteError !== DugiteError.RebaseWithLocalChanges
  ) {
    return error
  }

  const { repository, retryAction } = e.metadata

  if (!(repository instanceof Repository)) {
    return error
  }

  if (retryAction === undefined) {
    return error
  }

  if (e.metadata.gitContext?.kind === 'checkout') {
    dispatcher.incrementMetric(
      'errorWhenSwitchingBranchesWithUncommmittedChanges'
    )
  }

  const files = parseFilesToBeOverwritten(gitError.result.stderr)

  dispatcher.showPopup({
    type: PopupType.LocalChangesOverwritten,
    repository,
    retryAction,
    files,
  })

  return null
}

/**
 * Handler for when an action the user attempts to discard changes and they
 * cannot be moved to trash/recycle bin
 */
export async function discardChangesHandler(
  error: Error,
  dispatcher: Dispatcher
): Promise<Error | null> {
  if (!(error instanceof DiscardChangesError)) {
    return error
  }

  const { retryAction } = error.metadata

  if (retryAction === undefined) {
    return error
  }

  dispatcher.showPopup({
    type: PopupType.DiscardChangesRetry,
    retryAction,
  })

  return null
}

/**
 * Extract lines from Git's stderr output starting with the
 * prefix `remote: `. Useful to extract server-specific
 * error messages from network operations (fetch, push, pull,
 * etc).
 */
function getRemoteMessage(stderr: string) {
  const needle = 'remote: '

  return stderr
    .split(/\r?\n/)
    .filter(x => x.startsWith(needle))
    .map(x => x.substring(needle.length))
    .join('\n')
}
