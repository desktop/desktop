import * as React from 'react'
import { IStashEntry } from '../../lib/git/stash'

export const renderStashDiff: React.SFC<{
  stashEntry: IStashEntry
}> = props => {
  return (
    <div>
      <p>
        {`${props.stashEntry.name} created on ${
          props.stashEntry.branchName
        }@${props.stashEntry.stashSha.substr(0, 7)}`}
      </p>
    </div>
  )
}
