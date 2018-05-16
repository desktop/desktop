import * as React from 'react'
import * as moment from 'moment'

import { Octicon, OcticonSymbol } from '../octicons'
import { HighlightText } from '../lib/highlight-text'

import { IMenuItem } from '../../lib/menu-item'
import { showContextualMenu } from '../main-process-proxy'

interface IBranchListItemProps {
  /** The name of the branch */
  readonly name: string

  /** Specifies whether this item is currently selected */
  readonly isCurrentBranch: boolean

  /** The date may be null if we haven't loaded the tip commit yet. */
  readonly lastCommitDate: Date | null

  /** The characters in the branch name to highlight */
  readonly matches: ReadonlyArray<number>
}
/** The branch component. */
export class BranchListItem extends React.Component<IBranchListItemProps, {}> {
  private onContextMenu = (event: React.MouseEvent<any>) => {
    event.preventDefault()
    event.stopPropagation()

    const items: IMenuItem[] = [
      {
        label: 'Compare to this branch',
      },
    ]

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

        <div className="branches-list-item-menu" title={infoTitle}>
          <div className="branch-menu-wrapper" onClick={this.onContextMenu}>
            <Octicon symbol={OcticonSymbol.kebabHorizontal} />
          </div>
        </div>
      </div>
    )
  }
}
