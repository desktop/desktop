import * as React from 'react'
import * as moment from 'moment'

import { Branch } from '../../models/branch'

import { Octicon, OcticonSymbol } from '../octicons'
import { HighlightText } from '../lib/highlight-text'

import { IMenuItem } from '../../lib/menu-item'
import { showContextualMenu } from '../main-process-proxy'

interface IBranchListItemProps {
  /** The name of the branch */
  readonly branch: Branch

  /** Specifies whether this item is currently selected */
  readonly isCurrentBranch: boolean

  /** The date may be null if we haven't loaded the tip commit yet. */
  readonly lastCommitDate: Date | null

  /** The characters in the branch name to highlight */
  readonly matches: ReadonlyArray<number>

  /**
   * Callback to fire when the user wants to compare to this branch.
   *
   * If this is not specified, kebab element will not be rendered.
   */
  readonly onCompareToBranch?: (branch: Branch) => void
}
/** The branch component. */
export class BranchListItem extends React.Component<IBranchListItemProps, {}> {
  private onContextMenu = (event: React.MouseEvent<any>) => {
    event.preventDefault()
    event.stopPropagation()

    const items: IMenuItem[] = [
      {
        label: 'Compare to this branch',
        action: () => {
          if (this.props.onCompareToBranch) {
            this.props.onCompareToBranch(this.props.branch)
          }
        },
      },
    ]

    showContextualMenu(items)
  }

  private renderKebab = (lastCommitDate: Date | null, infoTitle: string) => {
    if (this.props.onCompareToBranch == null) {
      return null
    }

    return (
      <div className="branches-list-item-menu" title={infoTitle}>
        <div className="branch-menu-wrapper" onClick={this.onContextMenu}>
          <Octicon symbol={OcticonSymbol.kebabHorizontal} />
        </div>
      </div>
    )
  }

  public render() {
    const lastCommitDate = this.props.lastCommitDate
    const isCurrentBranch = this.props.isCurrentBranch
    const name = this.props.branch.name

    const date = lastCommitDate ? moment(lastCommitDate).fromNow() : ''
    const icon = isCurrentBranch ? OcticonSymbol.check : OcticonSymbol.gitBranch
    const infoTitle = isCurrentBranch
      ? 'Current branch'
      : lastCommitDate ? lastCommitDate.toString() : ''
    return (
      <div className="branches-list-item">
        <Octicon className="icon" symbol={icon} />
        <div className="name" title={name}>
          <HighlightText text={name} highlight={this.props.matches} />
        </div>

        <div className="description" title={infoTitle}>
          {date}
        </div>

        {this.renderKebab(lastCommitDate, infoTitle)}
      </div>
    )
  }
}
