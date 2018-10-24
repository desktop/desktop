import * as React from 'react'
import * as moment from 'moment'

import { IMatches } from '../../lib/fuzzy-find'

import { Octicon, OcticonSymbol } from '../octicons'
import { HighlightText } from '../lib/highlight-text'
import { showContextualMenu } from '../main-process-proxy';
import { IMenuItem } from '../../lib/menu-item';

interface IBranchListItemProps {
  /** The name of the branch */
  readonly name: string

  /** Specifies whether this item is currently selected */
  readonly isCurrentBranch: boolean

  /** The date may be null if we haven't loaded the tip commit yet. */
  readonly lastCommitDate: Date | null

  /** The characters in the branch name to highlight */
  readonly matches: IMatches

  /** The characters in the branch name to highlight */
  readonly onDeleteBranch: () => void
}

/** The branch component. */
export class BranchListItem extends React.Component<IBranchListItemProps, {}> {
  public render() {
    const lastCommitDate = this.props.lastCommitDate
    const isCurrentBranch = this.props.isCurrentBranch
    const name = this.props.name

    const date = lastCommitDate ? moment(lastCommitDate).fromNow() : ''
    const icon = isCurrentBranch ? OcticonSymbol.check : OcticonSymbol.gitBranch
    const infoTitle = isCurrentBranch
      ? 'Current branch'
      : lastCommitDate
        ? lastCommitDate.toString()
        : ''
    return (
      <div className="branches-list-item" onContextMenu={this.onDeleteBranch}>
        <Octicon className="icon" symbol={icon} />
        <div className="name" title={name}>
          <HighlightText text={name} highlight={this.props.matches.title} />
        </div>
        <div className="description" title={infoTitle}>
          {date}
        </div>
      </div >
    )
  }

  private onDeleteBranch = async (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()

    const menuItems: IMenuItem[] = [{ label: "Delete", action: this.props.onDeleteBranch }]
    showContextualMenu(menuItems)
  }
}
