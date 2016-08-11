import * as React from 'react'
import List from '../list'
import { Dispatcher } from '../../lib/dispatcher'
import Repository from '../../models/repository'
import { Branch } from '../../lib/local-git-operations'

const RowHeight = 22

interface IBranchesProps {
  readonly defaultBranch: Branch | null
  readonly currentBranch: Branch | null
  readonly allBranches: ReadonlyArray<Branch>
  readonly recentBranches: ReadonlyArray<Branch>
  readonly dispatcher: Dispatcher
  readonly repository: Repository
}

export default class Branches extends React.Component<IBranchesProps, void> {
  public componentDidMount() {
    this.props.dispatcher.loadBranches(this.props.repository)
  }

  private renderRow(branchItems: ReadonlyArray<BranchListItem>, row: number) {
    const item = branchItems[row]
    if (item.kind === 'branch') {
      const branch = item.branch
      return <div>{branch.name}</div>
    } else {
      return <div><strong>{item.label}</strong></div>
    }
  }

  private onSelectionChanged(branchItems: ReadonlyArray<BranchListItem>, row: number) {
    const item = branchItems[row]
    if (item.kind !== 'branch') { return }

    const branch = item.branch
    this.props.dispatcher.closePopup()
    this.props.dispatcher.checkoutBranch(this.props.repository, branch.name)
  }

  public render() {
    const branchItems = groupedBranches(this.props.defaultBranch, this.props.currentBranch, this.props.allBranches, this.props.recentBranches)
    return (
      <div id='branches' className='panel'>
        <List rowCount={branchItems.length}
              rowRenderer={row => this.renderRow(branchItems, row)}
              rowHeight={RowHeight}
              selectedRow={-1}
              onSelectionChanged={row => this.onSelectionChanged(branchItems, row)}/>
      </div>
    )
  }
}

type BranchListItem = { kind: 'branch', branch: Branch } | { kind: 'label', label: string }

function groupedBranches(defaultBranch: Branch | null, currentBranch: Branch | null, allBranches: ReadonlyArray<Branch>, recentBranches: ReadonlyArray<Branch>): ReadonlyArray<BranchListItem> {
  const items = new Array<BranchListItem>()

  if (defaultBranch) {
    items.push({ kind: 'label', label: 'Default Branch' })
    items.push({ kind: 'branch', branch: defaultBranch })
  }

  items.push({ kind: 'label', label: 'Recent Branches' })
  const recentBranchNames = new Set<string>()
  const defaultBranchName = defaultBranch ? defaultBranch.name : null
  recentBranches.forEach(branch => {
    if (branch.name !== defaultBranchName) {
      items.push({ kind: 'branch', branch: branch })
    }
    recentBranchNames.add(branch.name)
  })

  items.push({ kind: 'label', label: 'Other Branches' })
  allBranches.forEach(branch => {
    if (!recentBranchNames.has(branch.name)) {
      items.push({ kind: 'branch', branch: branch })
    }
  })

  return items
}
