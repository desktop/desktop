import * as React from 'react'
import { Dispatcher } from '../../lib/dispatcher'
import { OcticonSymbol } from '../octicons'
import { Repository } from '../../models/repository'
import { TipState } from '../../models/tip'
import { ToolbarDropdown, DropdownState } from './dropdown'
import { IRepositoryState } from '../../lib/app-state'
import { Branches } from '../branches'
import { assertNever } from '../../lib/fatal-error'

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
    const tipKind = tip.kind

    let icon = OcticonSymbol.gitBranch
    let iconClassName: string | undefined = undefined
    let title: string
    let description = __DARWIN__ ? 'Current Branch' : 'Current branch'
    let canOpen = true

    if (tip.kind === TipState.Unknown) {
      // TODO: this is bad and I feel bad
      return null
    } else if (tip.kind === TipState.Unborn) {
      title = 'master'
      canOpen = false
    } else if (tip.kind === TipState.Detached) {
      title = `On ${tip.currentSha.substr(0,7)}`
      icon = OcticonSymbol.gitCommit
      description = 'Detached HEAD'
    } else if (tip.kind === TipState.Valid) {
      title = tip.branch.name
    } else {
      return assertNever(tip, `Unknown tip state: ${tipKind}`)
    }

    const checkoutProgress = repositoryState.checkoutProgress

    if (checkoutProgress) {
      title = checkoutProgress.targetBranch
      description = __DARWIN__ ? 'Switching to Branch' : 'Switching to branch'

      if (checkoutProgress.progressValue > 0) {
        const friendlyProgress = Math.round(checkoutProgress.progressValue * 100)
        description = `${description} (${friendlyProgress} %)`
      }

      icon = OcticonSymbol.sync
      iconClassName = 'spin'
    }

    const isOpen = this.props.isOpen
    const currentState: DropdownState = isOpen && canOpen ? 'open' : 'closed'

    return <ToolbarDropdown
      className='branch-button'
      icon={icon}
      iconClassName={iconClassName}
      title={title}
      description={description}
      onDropdownStateChanged={this.props.onDropDownStateChanged}
      dropdownContentRenderer={this.renderBranchFoldout}
      dropdownState={currentState}
      showDisclosureArrow={canOpen}
    />
  }
}
