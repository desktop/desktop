import * as React from 'react'
import { Branch, BranchType } from '../../models/branch'

import { Row } from './row'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Ref } from './ref'
import { IStashEntry } from '../../models/stash-entry'
import { enableMoveStash } from '../../lib/feature-flag'

export function renderBranchHasRemoteWarning(branch: Branch) {
  if (branch.upstream != null) {
    return (
      <Row className="warning-helper-text">
        <Octicon symbol={octicons.alert} />
        <p>
          This branch is tracking <Ref>{branch.upstream}</Ref> and renaming this
          branch will not change the branch name on the remote.
        </p>
      </Row>
    )
  } else {
    return null
  }
}

export function renderBranchNameExistsOnRemoteWarning(
  sanitizedName: string,
  branches: ReadonlyArray<Branch>
) {
  const alreadyExistsOnRemote =
    branches.findIndex(
      b => b.nameWithoutRemote === sanitizedName && b.type === BranchType.Remote
    ) > -1

  if (alreadyExistsOnRemote === false) {
    return null
  }

  return (
    <Row className="warning-helper-text">
      <Octicon symbol={octicons.alert} />
      <p>
        A branch named <Ref>{sanitizedName}</Ref> already exists on the remote.
      </p>
    </Row>
  )
}

export function renderStashWillBeLostWarning(stash: IStashEntry | null) {
  if (stash === null || enableMoveStash()) {
    return null
  }
  return (
    <Row className="warning-helper-text">
      <Octicon symbol={octicons.alert} />
      <p>
        Your current stashed changes on this branch will no longer be visible in
        GitHub Desktop if the branch is renamed.
      </p>
    </Row>
  )
}
