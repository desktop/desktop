import * as React from 'react'

import { assertNever } from '../../lib/fatal-error'

import { Banner, BannerType } from '../../models/banner'

import { Dispatcher } from '../dispatcher'
import { MergeConflictsBanner } from './merge-conflicts-banner'

import { SuccessfulMerge } from './successful-merge'
import { RebaseConflictsBanner } from './rebase-conflicts-banner'
import { SuccessfulRebase } from './successful-rebase'
import { BranchAlreadyUpToDate } from './branch-already-up-to-date-banner'
import { SuccessfulCherryPick } from './successful-cherry-pick'
import { CherryPickConflictsBanner } from './cherry-pick-conflicts-banner'
import { CherryPickUndone } from './cherry-pick-undone'

export function renderBanner(
  banner: Banner,
  dispatcher: Dispatcher,
  onDismissed: () => void
): JSX.Element {
  switch (banner.type) {
    case BannerType.SuccessfulMerge:
      return (
        <SuccessfulMerge
          ourBranch={banner.ourBranch}
          theirBranch={banner.theirBranch}
          onDismissed={onDismissed}
          key={'successful-merge'}
        />
      )
    case BannerType.MergeConflictsFound:
      return (
        <MergeConflictsBanner
          dispatcher={dispatcher}
          ourBranch={banner.ourBranch}
          popup={banner.popup}
          onDismissed={onDismissed}
          key={'merge-conflicts'}
        />
      )
    case BannerType.SuccessfulRebase:
      return (
        <SuccessfulRebase
          targetBranch={banner.targetBranch}
          baseBranch={banner.baseBranch}
          onDismissed={onDismissed}
          key={'successful-rebase'}
        />
      )
    case BannerType.RebaseConflictsFound:
      return (
        <RebaseConflictsBanner
          dispatcher={dispatcher}
          targetBranch={banner.targetBranch}
          onOpenDialog={banner.onOpenDialog}
          onDismissed={onDismissed}
          key={'merge-conflicts'}
        />
      )
    case BannerType.BranchAlreadyUpToDate:
      return (
        <BranchAlreadyUpToDate
          ourBranch={banner.ourBranch}
          theirBranch={banner.theirBranch}
          onDismissed={onDismissed}
          key={'branch-already-up-to-date'}
        />
      )
    case BannerType.SuccessfulCherryPick:
      return (
        <SuccessfulCherryPick
          key="successful-cherry-pick"
          targetBranchName={banner.targetBranchName}
          countCherryPicked={banner.countCherryPicked}
          onDismissed={onDismissed}
          onUndoCherryPick={banner.onUndoCherryPick}
        />
      )
    case BannerType.CherryPickConflictsFound:
      return (
        <CherryPickConflictsBanner
          targetBranchName={banner.targetBranchName}
          onOpenConflictsDialog={banner.onOpenConflictsDialog}
          onDismissed={onDismissed}
          key={'cherry-pick-conflicts'}
        />
      )
    case BannerType.CherryPickUndone:
      return (
        <CherryPickUndone
          key="cherry-pick-undone"
          targetBranchName={banner.targetBranchName}
          countCherryPicked={banner.countCherryPicked}
          onDismissed={onDismissed}
        />
      )
    default:
      return assertNever(banner, `Unknown popup type: ${banner}`)
  }
}
