import * as React from 'react'

import { assertNever } from '../../lib/fatal-error'

import { Banner, BannerType } from '../../models/banner'

import { Dispatcher } from '../dispatcher'
import { MergeConflictsBanner } from './merge-conflicts-banner'

import { SuccessfulMerge } from './successful-merge'

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

    default:
      return assertNever(banner, `Unknown popup type: ${banner}`)
  }
}
