import * as React from 'react'
import * as moment from 'moment'

import { Octicon, OcticonSymbol } from '../octicons'

interface IBranchProps {
  readonly name: string
  readonly isCurrentBranch: boolean
  readonly lastCommitDate: Date
}

/** The branch component. */
export default function Branch({ name, isCurrentBranch, lastCommitDate }: IBranchProps) {
  const relative = moment(lastCommitDate).fromNow()
  return (
    <div className='branches-list-content'>
      <span className='branches-list-item'>{name}</span>
      <span>
        {isCurrentBranch ? <Octicon symbol={OcticonSymbol.check} /> : relative}
      </span>
    </div>
  )
}
