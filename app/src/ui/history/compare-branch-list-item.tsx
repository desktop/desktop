import * as React from 'react'

import { Octicon, OcticonSymbol } from '../octicons'
import { HighlightText } from '../lib/highlight-text'
import { Branch, IAheadBehind } from '../../models/branch'
import { IMatches } from '../../lib/fuzzy-find'

interface ICompareBranchListItemProps {
  readonly branch: Branch

  /** Specifies whether this item is currently selected */
  readonly isCurrentBranch: boolean

  /** The characters in the branch name to highlight */
  readonly matches: IMatches

  readonly aheadBehind: IAheadBehind | null
}

export class CompareBranchListItem extends React.Component<
  ICompareBranchListItemProps,
  {}
> {
  public render() {
    const isCurrentBranch = this.props.isCurrentBranch
    const branch = this.props.branch
    const icon = isCurrentBranch ? OcticonSymbol.check : OcticonSymbol.gitBranch

    const aheadBehind = this.props.aheadBehind

    const aheadBehindElement = aheadBehind ? (
      <div className="branch-commit-counter">
        <span className="branch-commit-counter-item">
          {aheadBehind.behind}
          <Octicon className="icon" symbol={OcticonSymbol.arrowDown} />
        </span>

        <span className="branch-commit-counter-item">
          {aheadBehind.ahead}
          <Octicon className="icon" symbol={OcticonSymbol.arrowUp} />
        </span>
      </div>
    ) : null

    return (
      <div className="branches-list-item">
        <Octicon className="icon" symbol={icon} />
        <div className="name" title={branch.name}>
          <HighlightText
            text={branch.name}
            highlight={this.props.matches.title}
          />
        </div>
        {aheadBehindElement}
      </div>
    )
  }
}
