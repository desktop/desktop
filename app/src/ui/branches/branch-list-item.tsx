import * as React from 'react'
import moment from 'moment'

import { IMatches } from '../../lib/fuzzy-find'

import { Octicon, OcticonSymbol } from '../octicons'
import { HighlightText } from '../lib/highlight-text'
import { showContextualMenu } from '../main-process-proxy'
import { IMenuItem } from '../../lib/menu-item'
import { String } from 'aws-sdk/clients/apigateway'
import classNames from 'classnames'

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

  readonly onDropOntoBranch?: (branchName: String) => void
}

interface IBranchListItemState {
  readonly isDraggedOver: boolean
}

/** The branch component. */
export class BranchListItem extends React.Component<
  IBranchListItemProps,
  IBranchListItemState
> {
  public constructor(props: IBranchListItemProps) {
    super(props)

    this.state = { isDraggedOver: false }
  }

  private onContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()

    /*
      There are multiple instances in the application where a branch list item
      is rendered. We only want to be able to rename or delete them on the
      branch dropdown menu. Thus, other places simply will not provide these
      methods, such as the merge and rebase logic.
    */
    const { onRenameBranch, onDeleteBranch, name, isLocal } = this.props
    if (onRenameBranch === undefined && onDeleteBranch === undefined) {
      return
    }

    const items: Array<IMenuItem> = []

    if (onRenameBranch !== undefined) {
      items.push({
        label: 'Rename…',
        action: () => onRenameBranch(name),
        enabled: isLocal,
      })
    }

    if (onDeleteBranch !== undefined) {
      items.push({
        label: 'Delete…',
        action: () => onDeleteBranch(name),
      })
    }

    showContextualMenu(items)
  }

  private onDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    this.setState({ isDraggedOver: true })
  }

  private onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    this.setState({ isDraggedOver: false })
  }

  private onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  private onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const { onDropOntoBranch, name, isCurrentBranch } = this.props

    if (onDropOntoBranch !== undefined && !isCurrentBranch) {
      onDropOntoBranch(name)
    }
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

    const className = classNames('branches-list-item', {
      'dragged-over': this.state.isDraggedOver,
    })

    return (
      <div
        onContextMenu={this.onContextMenu}
        className={className}
        onDragLeave={this.onDragLeave}
        onDragEnter={this.onDragEnter}
        onDragOver={this.onDragOver}
        onDrop={this.onDrop}
      >
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
