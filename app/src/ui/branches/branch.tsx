import * as React from 'react'
import * as moment from 'moment'

import { Octicon, OcticonSymbol } from '../octicons'
import { showContextualMenu, IMenuItem } from '../main-process-proxy'
import { Branch } from '../../models/branch'

interface IBranchProps {
  readonly name: string
  readonly branch: Branch
  readonly isCurrentBranch: boolean

  /** The date may be null if we haven't loaded the tip commit yet. */
  readonly lastCommitDate: Date | null

  /** The current filter text to render */
  readonly filterText: string
  readonly canShowBranchContextMenu: boolean
  readonly onCreateNewBranchFromStartPoint?: (branch: Branch) => void
  readonly onDeleteBranch?: (branch: Branch) => void
}

/** The branch component. */
export class BranchListItem extends React.Component<IBranchProps, {}> {
  private renderHighlightedName(name: string) {
    const filterText = this.props.filterText
    const matchStart = name.indexOf(filterText)
    const matchLength = filterText.length

    if (matchStart === -1) {
      return (
        <div className="name" title={name}>
          {name}
        </div>
      )
    }

    return (
      <div className="name" title={name}>
        {name.substr(0, matchStart)}
        <mark>{name.substr(matchStart, matchLength)}</mark>
        {name.substr(matchStart + matchLength)}
      </div>
    )
  }

  public render() {
    const lastCommitDate = this.props.lastCommitDate
    const isCurrentBranch = this.props.isCurrentBranch
    const name = this.props.name

    const date = lastCommitDate ? moment(lastCommitDate).fromNow() : ''
    const icon = isCurrentBranch ? OcticonSymbol.check : OcticonSymbol.gitBranch
    const infoTitle = isCurrentBranch
      ? 'Current branch'
      : lastCommitDate ? lastCommitDate.toString() : ''
    return (
      <div className="branches-list-item" onContextMenu={this.onContextMenu}>
        <Octicon className="icon" symbol={icon} />
        {this.renderHighlightedName(name)}
        <div className="description" title={infoTitle}>
          {date}
        </div>
      </div>
    )
  }

  private onContextMenu = (event: React.MouseEvent<any>) => {
    if (this.props.canShowBranchContextMenu) {
      event.preventDefault()

      const items: IMenuItem[] = [
        {
          label: __DARWIN__ ? 'New Branch From Here' : 'New branch from here',
          action: () => this.onCreateNewBranchFromStartPoint(),
        },
        {
          label: __DARWIN__ ? 'Delete Branch' : 'Delete branch',
          action: () => this.onDeleteBranch(),
        },
      ]

      showContextualMenu(items)
    }
  }

  private onCreateNewBranchFromStartPoint() {
    if (this.props.onCreateNewBranchFromStartPoint) {
      this.props.onCreateNewBranchFromStartPoint(this.props.branch)
    }
  }

  private onDeleteBranch() {
    if (this.props.onDeleteBranch) {
      this.props.onDeleteBranch(this.props.branch)
    }
  }
}
