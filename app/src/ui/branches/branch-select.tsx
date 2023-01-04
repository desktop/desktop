import * as React from 'react'
import { IMatches } from '../../lib/fuzzy-find'
import { Branch } from '../../models/branch'
import { ClickSource } from '../lib/list'
import { PopoverDropdown } from '../lib/popover-dropdown'
import { BranchList } from './branch-list'
import { renderDefaultBranch } from './branch-renderer'
import { IBranchListItem } from './group-branches'

interface IBranchSelectProps {
  /** The initially selected branch. */
  readonly branch: Branch | null

  /**
   * See IBranchesState.defaultBranch
   */
  readonly defaultBranch: Branch | null

  /**
   * The currently checked out branch
   */
  readonly currentBranch: Branch

  /**
   * See IBranchesState.allBranches
   */
  readonly allBranches: ReadonlyArray<Branch>

  /**
   * See IBranchesState.recentBranches
   */
  readonly recentBranches: ReadonlyArray<Branch>

  /** Called when the user changes the selected branch. */
  readonly onChange?: (branch: Branch) => void

  /** Optional: No branches message */
  readonly noBranchesMessage?: string | JSX.Element
}

interface IBranchSelectState {
  readonly selectedBranch: Branch | null
  readonly filterText: string
}

/**
 * A branch select element for filter and selecting a branch.
 */
export class BranchSelect extends React.Component<
  IBranchSelectProps,
  IBranchSelectState
> {
  private popoverRef = React.createRef<PopoverDropdown>()

  public constructor(props: IBranchSelectProps) {
    super(props)

    this.state = {
      selectedBranch: props.branch,
      filterText: '',
    }
  }

  private renderBranch = (item: IBranchListItem, matches: IMatches) => {
    return renderDefaultBranch(item, matches, this.props.currentBranch)
  }

  private onItemClick = (branch: Branch, source: ClickSource) => {
    source.event.preventDefault()
    this.popoverRef.current?.closePopover()
    this.setState({ selectedBranch: branch })
    this.props.onChange?.(branch)
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  public render() {
    const {
      currentBranch,
      defaultBranch,
      recentBranches,
      allBranches,
      noBranchesMessage,
    } = this.props

    const { filterText, selectedBranch } = this.state

    return (
      <PopoverDropdown
        contentTitle="Choose a base branch"
        buttonContent={selectedBranch?.name ?? ''}
        label="base:"
        ref={this.popoverRef}
      >
        <BranchList
          allBranches={allBranches}
          currentBranch={currentBranch}
          defaultBranch={defaultBranch}
          recentBranches={recentBranches}
          filterText={filterText}
          onFilterTextChanged={this.onFilterTextChanged}
          selectedBranch={selectedBranch}
          canCreateNewBranch={false}
          renderBranch={this.renderBranch}
          onItemClick={this.onItemClick}
          noBranchesMessage={noBranchesMessage}
        />
      </PopoverDropdown>
    )
  }
}
