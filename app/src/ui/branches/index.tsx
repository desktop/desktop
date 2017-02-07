import * as React from 'react'
import { Dispatcher } from '../../lib/dispatcher'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { groupBranches, IBranchListItem, BranchGroupIdentifier } from './group-branches'
import { BranchListItem } from './branch'
import { CreateBranch } from '../create-branch'
import { FoldoutList } from '../lib/foldout-list'
import { FoldoutType } from '../../lib/app-state'

const BranchesFoldoutList: new() => FoldoutList<IBranchListItem> = FoldoutList as any

const RowHeight = 30

interface IBranchesProps {
  readonly defaultBranch: Branch | null
  readonly currentBranch: Branch | null
  readonly allBranches: ReadonlyArray<Branch>
  readonly recentBranches: ReadonlyArray<Branch>
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly expandCreateBranch: boolean
}

export class Branches extends React.Component<IBranchesProps, void> {
  private renderItem = (item: IBranchListItem) => {
    const branch = item.branch
    const commit = branch.tip
    const currentBranchName = this.props.currentBranch ? this.props.currentBranch.name : null
    return <BranchListItem
      name={branch.name}
      isCurrentBranch={branch.name === currentBranchName}
      lastCommitDate={commit ? commit.author.date : null}/>
  }

  private renderGroupHeader = (identifier: BranchGroupIdentifier) => {
    let label
    if (identifier === 'default') {
      label = 'Default Branch'
    } else if (identifier === 'recent') {
      label = 'Recent Branches'
    } else if (identifier === 'other') {
      label = 'Other Branches'
    }

    return <div className='branches-list-content branches-list-label'>{label}</div>
  }

  private onItemClick = (item: IBranchListItem) => {
    const branch = item.branch
    this.props.dispatcher.closeFoldout()
    this.props.dispatcher.checkoutBranch(this.props.repository, branch.nameWithoutRemote)
  }

  private onHideCreateBranch = () => {
    this.props.dispatcher.showFoldout({
      type: FoldoutType.Branch,
      expandCreateBranch: false,
    })
  }

  private onCreateBranchToggle = () => {
    this.props.dispatcher.showFoldout({
      type: FoldoutType.Branch,
      expandCreateBranch: !this.props.expandCreateBranch,
    })
  }

  private renderCreateBranch = () => {
    if (!this.props.expandCreateBranch) {
      return null
    }

    return (
      <div id='new-branch'>
        <CreateBranch
          branches={this.props.allBranches}
          currentBranch={this.props.currentBranch}
          dispatcher={this.props.dispatcher}
          repository={this.props.repository}
          hideBranchPanel={this.onHideCreateBranch} />
      </div>
    )
  }

  private onClose = () => {
    this.props.dispatcher.closeFoldout()
  }

  public render() {
    const groups = groupBranches(this.props.defaultBranch, this.props.currentBranch, this.props.allBranches, this.props.recentBranches)

    let selectedItem: IBranchListItem | null = null
    const currentBranch = this.props.currentBranch
    if (currentBranch) {
      for (const group of groups) {
        selectedItem = group.items.find(i => {
          const branch = i.branch
          return branch.name === currentBranch.name
        }) || null

        if (selectedItem) { break }
      }
    }

    return (
      <BranchesFoldoutList
        className='branches-list'
        expandButtonTitle={__DARWIN__ ? 'Create New Branch' : 'Create new branch'}
        showExpansion={this.props.expandCreateBranch}
        onExpandClick={this.onCreateBranchToggle}
        renderExpansion={this.renderCreateBranch}
        rowHeight={RowHeight}
        selectedItem={selectedItem}
        renderItem={this.renderItem}
        renderGroupHeader={this.renderGroupHeader}
        onItemClick={this.onItemClick}
        groups={groups}
        onClose={this.onClose}
        invalidationProps={this.props.allBranches}/>
    )
  }
}
