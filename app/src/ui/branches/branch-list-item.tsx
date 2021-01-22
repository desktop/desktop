import * as React from 'react'
import moment from 'moment'

import { IMatches } from '../../lib/fuzzy-find'

import { Octicon, OcticonSymbol } from '../octicons'
import { HighlightText } from '../lib/highlight-text'
import { showContextualMenu } from '../main-process-proxy'
import { IMenuItem } from '../../lib/menu-item'

interface IBranchListItemProps {
  /** The name of the branch */
  readonly name: string

  /** Specifies whether this item is currently selected */
  readonly isCurrentBranch: boolean

  /** The date may be null if we haven't loaded the tip commit yet. */
  readonly lastCommitDate: Date | null

  /** The characters in the branch name to highlight */
  readonly matches: IMatches

  /** Specifies whether the branch is local */
  readonly isLocal: boolean

  readonly onRenameBranch?: (branchName: string) => void

  readonly onDeleteBranch?: (branchName: string) => void
}

/** The branch component. */
export class BranchListItem extends React.Component<IBranchListItemProps, {}> {
  private onContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()

    /*
      There are multiple instances in the application where a branch list item
      is rendered. We only want to be able to rename or delete them on the
      branch dropdown menu. Thus, other places simply won't provide these
      methods, such as the merge and rebase logic.
    */
    if (
      this.props.onRenameBranch === undefined &&
      this.props.onDeleteBranch === undefined
    ) {
      return
    }

    // TODO: find out - does branch menu have "Rename..." because ... stand
    // for branch name? If so is it needed here? (same for delete)
    // Also, branch menu has & in front for not mac, what is that?
    // Should it be disabled for current branch? - note from prev PR
    const items: Array<IMenuItem> = []

    if (this.props.onRenameBranch !== undefined) {
      items.push({
        label: 'Rename...',
        action: () =>
          this.props.onRenameBranch !== undefined &&
          this.props.onRenameBranch(this.props.name),
        enabled: this.props.isLocal,
      })
    }

    if (this.props.onDeleteBranch !== undefined) {
      items.push({
        label: 'Delete...',
        action: () =>
          this.props.onDeleteBranch !== undefined &&
          this.props.onDeleteBranch(this.props.name),
      })
    }

    showContextualMenu(items)
  }

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
      <div onContextMenu={this.onContextMenu} className="branches-list-item">
        <Octicon className="icon" symbol={icon} />
        <div className="name" title={name}>
          <HighlightText text={name} highlight={this.props.matches.title} />
        </div>
        <div className="description" title={infoTitle}>
          {date}
        </div>
      </div>
    )
  }
}
