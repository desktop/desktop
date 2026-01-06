import * as React from 'react'

import { assertNever } from '../../lib/fatal-error'

import { Toast, ToastType } from '../../models/toast'

import { Dispatcher } from '../dispatcher'
import { MergeConflictsToast } from './merge-conflicts-toast'

import { SuccessfulMerge } from './successful-merge'
import { RebaseConflictsToast } from './rebase-conflicts-toast'
import { SuccessfulRebase } from './successful-rebase'
import { BranchAlreadyUpToDate } from './branch-already-up-to-date-toast'
import { SuccessfulCherryPick } from './successful-cherry-pick'
import { CherryPickConflictsToast } from './cherry-pick-conflicts-toast'
import { CherryPickUndone } from './cherry-pick-undone'
import { OpenThankYouCard } from './open-thank-you-card'
import { SuccessfulSquash } from './successful-squash'
import { SuccessToast } from './success-toast'
import { ConflictsFoundToast } from './conflicts-found-toast'
import { OSVersionNoLongerSupportedToast } from './os-version-no-longer-supported-toast'

export function renderToast(
  toast: Toast,
  dispatcher: Dispatcher,
  onDismissed: () => void
): JSX.Element {
  switch (toast.type) {
    case ToastType.SuccessfulMerge:
      return (
        <SuccessfulMerge
          ourBranch={toast.ourBranch}
          theirBranch={toast.theirBranch}
          onDismissed={onDismissed}
          key={'successful-merge'}
        />
      )
    case ToastType.MergeConflictsFound:
      return (
        <MergeConflictsToast
          dispatcher={dispatcher}
          ourBranch={toast.ourBranch}
          popup={toast.popup}
          onDismissed={onDismissed}
          key={'merge-conflicts'}
        />
      )
    case ToastType.SuccessfulRebase:
      return (
        <SuccessfulRebase
          targetBranch={toast.targetBranch}
          baseBranch={toast.baseBranch}
          onDismissed={onDismissed}
          key={'successful-rebase'}
        />
      )
    case ToastType.RebaseConflictsFound:
      return (
        <RebaseConflictsToast
          dispatcher={dispatcher}
          targetBranch={toast.targetBranch}
          onOpenDialog={toast.onOpenDialog}
          onDismissed={onDismissed}
          key={'merge-conflicts'}
        />
      )
    case ToastType.BranchAlreadyUpToDate:
      return (
        <BranchAlreadyUpToDate
          ourBranch={toast.ourBranch}
          theirBranch={toast.theirBranch}
          onDismissed={onDismissed}
          key={'branch-already-up-to-date'}
        />
      )
    case ToastType.SuccessfulCherryPick:
      return (
        <SuccessfulCherryPick
          key="successful-cherry-pick"
          targetBranchName={toast.targetBranchName}
          countCherryPicked={toast.count}
          onDismissed={onDismissed}
          onUndo={toast.onUndo}
        />
      )
    case ToastType.CherryPickConflictsFound:
      return (
        <CherryPickConflictsToast
          targetBranchName={toast.targetBranchName}
          onOpenConflictsDialog={toast.onOpenConflictsDialog}
          onDismissed={onDismissed}
          key={'cherry-pick-conflicts'}
        />
      )
    case ToastType.CherryPickUndone:
      return (
        <CherryPickUndone
          key="cherry-pick-undone"
          targetBranchName={toast.targetBranchName}
          countCherryPicked={toast.countCherryPicked}
          onDismissed={onDismissed}
        />
      )
    case ToastType.OpenThankYouCard:
      return (
        <OpenThankYouCard
          key="open-thank-you-card"
          emoji={toast.emoji}
          onDismissed={onDismissed}
          onOpenCard={toast.onOpenCard}
          onThrowCardAway={toast.onThrowCardAway}
        />
      )
    case ToastType.SuccessfulSquash:
      return (
        <SuccessfulSquash
          key="successful-squash"
          count={toast.count}
          onDismissed={onDismissed}
          onUndo={toast.onUndo}
        />
      )
    case ToastType.SquashUndone: {
      const pluralized = toast.commitsCount === 1 ? 'commit' : 'commits'
      return (
        <SuccessToast
          key="squash-undone"
          timeout={5000}
          onDismissed={onDismissed}
        >
          Squash of {toast.commitsCount} {pluralized} undone.
        </SuccessToast>
      )
    }
    case ToastType.SuccessfulReorder: {
      const pluralized = toast.count === 1 ? 'commit' : 'commits'

      return (
        <SuccessToast
          key="successful-reorder"
          timeout={15000}
          onDismissed={onDismissed}
          onUndo={toast.onUndo}
        >
          <span>
            Successfully reordered {toast.count} {pluralized}.
          </span>
        </SuccessToast>
      )
    }
    case ToastType.ReorderUndone: {
      const pluralized = toast.commitsCount === 1 ? 'commit' : 'commits'
      return (
        <SuccessToast
          key="reorder-undone"
          timeout={5000}
          onDismissed={onDismissed}
        >
          Reorder of {toast.commitsCount} {pluralized} undone.
        </SuccessToast>
      )
    }
    case ToastType.ConflictsFound:
      return (
        <ConflictsFoundToast
          operationDescription={toast.operationDescription}
          onOpenConflictsDialog={toast.onOpenConflictsDialog}
          onDismissed={onDismissed}
          key={'conflicts-found'}
        ></ConflictsFoundToast>
      )
    case ToastType.OSVersionNoLongerSupported:
      return <OSVersionNoLongerSupportedToast onDismissed={onDismissed} />
    default:
      return assertNever(toast, `Unknown toast type: ${toast}`)
  }
}
