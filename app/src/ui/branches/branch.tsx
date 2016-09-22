import * as React from 'react'
import * as moment from 'moment'

import { Octicon, OcticonSymbol } from '../octicons'

interface IBranchProps {
  readonly name: string
  readonly isCurrentBranch: boolean

  /** The date may be null if we haven't loaded the tip commit yet. */
  readonly lastCommitDate: Date | null
}

/** The branch component. */
export function BranchListItem({ name, isCurrentBranch, lastCommitDate }: IBranchProps) {
  const date = lastCommitDate ? moment(lastCommitDate).fromNow() : ''
  const info = isCurrentBranch ? <Octicon symbol={OcticonSymbol.check} /> : date
  const infoTitle = isCurrentBranch ? 'Current branch' : (lastCommitDate ? lastCommitDate.toString() : '')
  return (
    <div className='branches-list-content'>
      <span className='branches-list-item'>{name}</span>
      <span title={infoTitle}>{info}</span>
    </div>
  )
}
