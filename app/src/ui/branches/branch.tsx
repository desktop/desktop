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
export default function Branch({ name, isCurrentBranch, lastCommitDate }: IBranchProps) {
  const date = lastCommitDate ? moment(lastCommitDate).fromNow() : ''
  return (
    <div className='branches-list-content'>
      <span className='branches-list-item'>{name}</span>
      <span>
        {isCurrentBranch ? <Octicon symbol={OcticonSymbol.check} /> : date}
      </span>
    </div>
  )
}
