import {
  GitError as DugiteError,
  RepositoryDoesNotExistErrorCode,
} from 'dugite'

import { Dispatcher } from '.'
import { ExternalEditorError } from '../../lib/editors/shared'
import { ErrorWithMetadata } from '../../lib/error-with-metadata'
import { AuthenticationErrors } from '../../lib/git/authentication'
import { GitError } from '../../lib/git/core'
import { ShellError } from '../../lib/shells'
import { UpstreamAlreadyExistsError } from '../../lib/stores/upstream-already-exists-error'

import { PopupType } from '../../models/popup'
import { Repository } from '../../models/repository'

/** An error which also has a code property. */
interface IErrorWithCode extends Error {
  readonly code: string
}

/**
 * Cast the error to an error containing a code if it has a code. Otherwise
 * return null.
 */
function asErrorWithCode(error: Error): IErrorWithCode | null {
  const e = error as any
  if (e.code) {
    return e
  } else {
    return null
  }
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

/** Handle git authentication errors in a manner that seems Right And Good. */
export async function gitAuthenticationErrorHandler(
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
  if (!dugiteError) {
    return error
  }

  if (!AuthenticationErrors.has(dugiteError)) {
    return error
  }

  const repository = e.metadata.repository
  if (!repository) {
    return error
  }

  // If it's a GitHub repository then it's not some generic git server
  // authentication problem, but more likely a legit permission problem. So let
  // the error continue to bubble up.
  if (repository instanceof Repository && repository.gitHubRepository) {
    return error
  }

  const retry = e.metadata.retryAction
  if (!retry) {
    log.error(`No retry action provided for a git authentication error.`, e)
    return error
  }

  await dispatcher.promptForGenericGitAuthentication(repository, retry)

  return null
}

export async function externalEditorErrorHandler(
  error: Error,
  dispatcher: Dispatcher
): Promise<Error | null> {
  const e = asEditorError(error)
  if (!e) {
    return error
  }

  const { suggestAtom, openPreferences } = e.metadata

  await dispatcher.showPopup({
    type: PopupType.ExternalEditorFailed,
    message: e.message,
    suggestAtom,
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
  if (!dugiteError) {
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
  if (!dugiteError) {
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

  switch (gitContext.kind) {
    case 'pull':
      dispatcher.mergeConflictDetectedFromPull()
      break
    case 'merge':
      dispatcher.mergeConflictDetectedFromExplicitMerge()
      break
  }

  const { currentBranch, theirBranch } = gitContext

  dispatcher.showPopup({
    type: PopupType.MergeConflicts,
    repository,
    ourBranch: currentBranch,
    theirBranch,
  })

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
  if (!dugiteError) {
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
  if (!dugiteError) {
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

  const { currentBranch } = gitContext

  dispatcher.launchRebaseFlow(repository, currentBranch)

  return null
}

/**
 * Handler for when we attempt to checkout a branch and there are some files that would
 * be overwritten.
 */
export async function localChangesOverwrittenHandler(
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
  if (!dugiteError) {
    return error
  }

  if (dugiteError !== DugiteError.LocalChangesOverwritten) {
    return error
  }

  const { repository } = e.metadata
  if (repository == null) {
    return error
  }

  if (!(repository instanceof Repository)) {
    return error
  }
}
