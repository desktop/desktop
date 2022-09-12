import * as React from 'react'
import { Branch } from '../../models/branch'
import { Button } from '../lib/button'
import { Ref } from '../lib/ref'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'

interface IBranchSelectProps {
  /** The initially selected branch. */
  readonly branch: Branch

  /** Called when the user changes the selected branch. */
  readonly onChange?: (branch: Branch) => void
}

interface IBranchSelectState {
  readonly showBranchDropdown: boolean
  readonly selectedBranch: Branch
}

/**
 * A branch select element for filter and selecting a branch.
 */
export class BranchSelect extends React.Component<
  IBranchSelectProps,
  IBranchSelectState
> {
  public constructor(props: IBranchSelectProps) {
    super(props)

    this.state = {
      showBranchDropdown: false,
      selectedBranch: props.branch,
    }
  }

  private toggleBranchDropdown = () => {
    this.setState({ showBranchDropdown: !this.state.showBranchDropdown })
  }

  public renderBranchDropdown() {
    if (!this.state.showBranchDropdown) {
      return
    }

    return <div className="branch-select-dropdown">List of branches here!</div>
  }

  public render() {
    return (
      <div className="branch-select-component">
        <Button onClick={this.toggleBranchDropdown}>
          <Ref>
            {this.state.selectedBranch.name}{' '}
            <Octicon symbol={OcticonSymbol.triangleDown} />
          </Ref>
        </Button>
        {this.renderBranchDropdown()}
      </div>
    )
  }
}
