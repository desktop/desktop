import * as React from 'react'
import { Branch } from '../../models/branch'
import { Ref } from '../lib/ref'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'

interface IBranchSelectProps {
  /** The selected branch. */
  readonly selectedBranch: Branch

  /** Called when the user changes the selected branch. */
  readonly onChange?: (branch: Branch) => void
}

/**
 * A branch select element for filter and selecting a branch.
 */
export class BranchSelect extends React.Component<IBranchSelectProps, {}> {
  public render() {
    return (
      <div className="branch-select-component">
        <Ref>
          {this.props.selectedBranch.name}{' '}
          <Octicon symbol={OcticonSymbol.triangleDown} />
        </Ref>
      </div>
    )
  }
}
