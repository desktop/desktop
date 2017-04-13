import * as React from 'react'
import { Dispatcher } from '../../lib/dispatcher'
import { OcticonSymbol } from '../octicons'
import { Repository } from '../../models/repository'
import { TipState } from '../../models/tip'
import { ToolbarDropdown, DropdownState } from './dropdown'
import { IRepositoryState } from '../../lib/app-state'
import { Branches } from '../branches'

interface IBranchDropdownProps {
  readonly repository: Repository
  readonly repositoryState: IRepositoryState

  readonly isOpen: boolean
  readonly onDropDownStateChanged: (state: DropdownState) => void

  readonly dispatcher: Dispatcher
}

/**
 * A drop down for selecting the currently checked out branch.
 */
export class BranchDropdown extends React.Component<IBranchDropdownProps, void> {
  private renderBranchFoldout = (): JSX.Element | null => {
    const repositoryState = this.props.repositoryState
    const branchesState = repositoryState.branchesState

    const tip = repositoryState.branchesState.tip
    const currentBranch = tip.kind === TipState.Valid
      ? tip.branch
      : null

    return <Branches
      allBranches={branchesState.allBranches}
      recentBranches={branchesState.recentBranches}
      currentBranch={currentBranch}
      defaultBranch={branchesState.defaultBranch}
      dispatcher={this.props.dispatcher}
      repository={this.props.repository}
    />
  }

  public render() {

    const repositoryState = this.props.repositoryState
    const branchesState = repositoryState.branchesState

    const tip = branchesState.tip

    if (tip.kind === TipState.Unknown) {
      // TODO: this is bad and I feel bad
      return null
    }

    console.log(repositoryState.checkoutProgress)

    if (tip.kind === TipState.Unborn) {
      return <ToolbarDropdown
        className='branch-button'
        icon={OcticonSymbol.gitBranch}
        title='master'
        description='Current branch'
        onDropdownStateChanged={this.props.onDropDownStateChanged}
        dropdownContentRenderer={this.renderBranchFoldout}
        dropdownState='closed' />
    }

    const isOpen = this.props.isOpen

    const currentState: DropdownState = isOpen ? 'open' : 'closed'

    if (tip.kind === TipState.Detached) {
      const title = `On ${tip.currentSha.substr(0,7)}`
      return <ToolbarDropdown
        className='branch-button'
        icon={OcticonSymbol.gitCommit}
        title={title}
        description='Detached HEAD'
        onDropdownStateChanged={this.props.onDropDownStateChanged}
        dropdownContentRenderer={this.renderBranchFoldout}
        dropdownState={currentState} />
    }

    return <ToolbarDropdown
      className='branch-button'
      icon={OcticonSymbol.gitBranch}
      title={tip.branch.name}
      description='Current branch'
      onDropdownStateChanged={this.props.onDropDownStateChanged}
      dropdownContentRenderer={this.renderBranchFoldout}
      dropdownState={currentState} />
  }
}
