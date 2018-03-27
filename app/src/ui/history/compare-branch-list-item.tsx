import * as React from 'react'

import { Octicon, OcticonSymbol } from '../octicons'
import { HighlightText } from '../lib/highlight-text'
import { Branch } from '../../models/branch'
import { ICompareResult } from '../../lib/git'
import { Dispatcher } from '../../lib/dispatcher'
import { Repository } from '../../models/repository'

interface ICompareBranchListItemProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly branch: Branch

  /** Specifies whether this item is currently selected */
  readonly isCurrentBranch: boolean

  /** The characters in the branch name to highlight */
  readonly matches: ReadonlyArray<number>
}

interface ICompareBranchListItemState {
  readonly compareResult: ICompareResult | null
}

export class CompareBranchListItem extends React.Component<
  ICompareBranchListItemProps,
  ICompareBranchListItemState
> {
  public constructor(props: ICompareBranchListItemProps) {
    super(props)

    this.state = {
      compareResult: null,
    }
  }

  public async componentWillMount() {
    const compareResult = await this.props.dispatcher.getCompareResult(
      this.props.repository,
      this.props.branch
    )

    this.setState({ compareResult })
  }

  public render() {
    const isCurrentBranch = this.props.isCurrentBranch
    const branch = this.props.branch
    const icon = isCurrentBranch ? OcticonSymbol.check : OcticonSymbol.gitBranch
    const compareState = this.state.compareResult

    if (compareState === null) {
      return null
    }

    return (
      <div className="branches-list-item">
        <Octicon className="icon" symbol={icon} />
        <div className="name" title={branch.name}>
          <HighlightText text={branch.name} highlight={this.props.matches} />
        </div>
        <div className="branch-commit-counter">
          {compareState.ahead}
          <Octicon className="icon" symbol={OcticonSymbol.arrowUp} />
          {compareState.behind}
          <Octicon className="icon" symbol={OcticonSymbol.arrowDown} />
        </div>
      </div>
    )
  }
}
